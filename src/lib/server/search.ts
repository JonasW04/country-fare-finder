import { candidateAirports } from "../airports";
import { bookingLink } from "../booking-link";
import type { FlightProvider, Offer } from "../providers/types";
import {
  OfferStore,
  estimateLegsToVerify,
  exactReplacements,
  hasEstimateLeg,
  estimateMarkup,
  legKey,
  markupRatios,
  rankCombinations,
  replaceEstimates,
  scaleEstimates,
} from "../ranking";
import type { Combination } from "../ranking";
import type { SearchRequest } from "../search-request";
import { CallBudget } from "./budget";
import type { TtlCache } from "./cache";
import type { SearchConfig } from "./config";
import { LookupRunner } from "./lookups";
import type { PhaseTally } from "./lookups";
import { eligibleCities, planInbound, planOutbound } from "./plan";
import type { Lookup, PlanContext } from "./plan";
import { airportSummaries, originSummaries, outboundCalendar } from "./summaries";

export const ESTIMATE_NOTE = "Prices marked ≈ are fare-calendar lows scaled by how far exact fares sat above them in this search; confirm them on the booking page.";

export interface SearchDeps {
  provider: FlightProvider;
  requested: string;
  fellBack: boolean;
  cache: TtlCache<Offer[]>;
  config: SearchConfig;
  sleep?: (ms: number) => Promise<void>;
}

/** One candidate airport of the destination country, for the map and the per-city price list. */
export interface AirportSummary {
  iata: string;
  city: string;
  metro: string;
  lat: number;
  lon: number;
  /** Cheapest usable outbound fare to this airport over all origins and dates; absent when none was found. */
  cheapestOut?: number;
  /** Cheapest usable return fare from this airport; absent when none was found or none was looked up. */
  cheapestIn?: number;
}

/** A searched origin. Location is absent when the code is not in any bundled dataset. */
export interface OriginSummary {
  iata: string;
  city?: string;
  lat?: number;
  lon?: number;
}

export interface DayPrice {
  date: string;
  price: number;
}

export interface SearchResponse {
  provider: { name: string; requested: string; fellBack: boolean };
  request: SearchRequest;
  providerCalls: number;
  cacheHits: number;
  cacheMisses: number;
  budget: { max: number; used: number; exhausted: boolean };
  candidateAirports: number;
  lookupsPlanned: number;
  lookupsSkipped: number;
  lookupsFailed: number;
  partial: boolean;
  notes: string[];
  combinations: Combination[];
  citiesWithoutReturn: string[];
  /** Every candidate airport, busiest first, with the cheapest fares found for it. */
  airports: AirportSummary[];
  origins: OriginSummary[];
  /** Cheapest usable outbound fare per departure date across the whole country, ascending by date. */
  outboundCalendar: DayPrice[];
  /** How many of the returned combinations have only exactly quoted legs (no fare-calendar estimate). */
  verifiedCombinations: number;
}

function combineTallies(a: PhaseTally, b: PhaseTally): PhaseTally {
  return {
    skipped: a.skipped + b.skipped,
    haltedSkipped: a.haltedSkipped + b.haltedSkipped,
    failed: a.failed + b.failed,
    failureNotes: new Set([...a.failureNotes, ...b.failureNotes]),
  };
}

/**
 * Phase 3: per-day calendars give estimates, so the top combinations get their estimate legs
 * re-priced by exact one-way searches. A lookup lost here only leaves an estimate in place, so it
 * never makes the response partial.
 */
async function verifyEstimates(
  req: SearchRequest,
  deps: SearchDeps,
  runner: LookupRunner,
  legs: Offer[],
  withLink: (o: Offer) => Offer,
): Promise<{ lookups: number; replacements: Map<string, Offer> }> {
  const base = { cabin: req.cabin, adults: req.adults, currency: req.currency };
  const lookups: Lookup[] = legs.map((leg) => ({
    direction: "out",
    query: { ...base, origin: leg.origin, destination: leg.destination, date: leg.date },
  }));
  const exact: Offer[] = [];
  await runner.run(lookups, (lookup, offers) => exact.push(...offers.map(withLink)));
  return { lookups: lookups.length, replacements: exactReplacements(exact, req.currency) };
}

export async function runSearch(req: SearchRequest, deps: SearchDeps): Promise<SearchResponse> {
  const origins = [req.origin, ...(req.secondOrigin ? [req.secondOrigin] : [])];
  const cap = deps.config.maxAirportsPerCountry;
  // A cap keeps the largest airports and collapses metro siblings so the cap buys distinct cities.
  const candidates = candidateAirports(req.country, origins, cap ?? Infinity, cap !== undefined);
  const budget = new CallBudget(deps.config.maxProviderCalls);
  // A metro query can return any airport of that metro, so offers must resolve for all of them.
  const metros = new Set(candidates.map((a) => a.metro));
  const known = candidateAirports(req.country, origins).filter((a) => metros.has(a.metro));
  const store = new OfferStore(known);
  const runner = new LookupRunner(deps, budget);
  const plan: PlanContext = { req, origins, candidates, provider: deps.provider, maxDatesPerLeg: deps.config.maxDatesPerLeg };

  const foreignCurrencies = new Set<string>();
  const withLink = (offer: Offer): Offer => ({ ...offer, bookingUrl: offer.bookingUrl ?? bookingLink(offer, req, deps.provider.name) });
  const collect = ({ direction }: Lookup, offers: Offer[]) => {
    for (const offer of offers) {
      if (offer.currency !== req.currency) foreignCurrencies.add(offer.currency);
      store.add(direction, withLink(offer));
    }
  };

  const outbound = planOutbound(plan);
  const outTally = await runner.run(outbound, collect);
  // Returns are only worth asking for cities that can be reached at all.
  const cities = eligibleCities(store.offers("out"), known, candidates, origins, req.currency);
  const inbound = planInbound(plan, cities);
  const tally = combineTallies(outTally, await runner.run(inbound, collect));
  const coverageLookups = outbound.length + inbound.length;
  const haltReason = runner.haltReason;

  let outOffers = store.offers("out");
  let inOffers = store.offers("in");
  const rank = (limit: number) =>
    rankCombinations({
      outbound: outOffers,
      inbound: inOffers,
      airports: known,
      currency: req.currency,
      minNights: req.minNights,
      maxNights: req.maxNights,
      limit,
    });

  let verifyLookups = 0;
  if (deps.config.verifyTop > 0 && deps.provider.range?.perDay) {
    // Calendar lows are usually below the exact fare, so a re-priced combination tends to sink and an
    // unchecked one takes its place. Re-check in rounds until the top is exact, within a fixed cap.
    const maxLookups = deps.config.verifyTop * 4;
    const attempted = new Set<string>();
    const replacements = new Map<string, Offer>();
    const markups: number[] = [];
    const baseOut = outOffers;
    const baseIn = inOffers;
    // After the first round the ranked legs carry scaled prices; the gap is measured against the raw low.
    const rawLows = new Map([...baseOut, ...baseIn].filter((o) => o.estimate).map((o) => [legKey(o), o.price]));
    while (verifyLookups < maxLookups && !budget.exhausted) {
      const legs = estimateLegsToVerify(rank(Infinity).combinations, deps.config.verifyTop, attempted).slice(0, maxLookups - verifyLookups);
      if (legs.length === 0) break;
      for (const leg of legs) attempted.add(legKey(leg));
      const verified = await verifyEstimates(req, deps, runner, legs, withLink);
      verifyLookups += verified.lookups;
      for (const [key, offer] of verified.replacements) replacements.set(key, offer);
      markups.push(...markupRatios(legs, verified.replacements, rawLows));
      // Unchecked lows are scaled by how far exact fares sat above them in this search, so checked
      // and unchecked combinations compete on the same footing instead of lows always floating up.
      const factor = estimateMarkup(markups);
      outOffers = scaleEstimates(replaceEstimates(baseOut, replacements), factor);
      inOffers = scaleEstimates(replaceEstimates(baseIn, replacements), factor);
    }
  }
  const ranked = rank(req.limit);

  const notes: string[] = [];
  if (deps.fellBack) {
    notes.push(`FLIGHT_PROVIDER=${deps.requested} was requested but credentials are missing, so mock data was used.`);
  }
  if (tally.skipped > 0) {
    notes.push(
      `Provider call budget (${budget.max}) exhausted: ${tally.skipped} of ${coverageLookups} price lookups were skipped, so these results are partial.`,
    );
  }
  if (haltReason) {
    notes.push(`${haltReason} ${tally.haltedSkipped} of ${coverageLookups} price lookups were skipped, so these results are partial.`);
  } else if (runner.haltReason) {
    // Stopped during the re-check: every fare was found, only some stay estimates, but the next search will hit the same wall.
    notes.push(`${runner.haltReason} Some prices could not be re-checked.`);
  }
  if (foreignCurrencies.size > 0) {
    notes.push(
      `The provider priced some fares in ${[...foreignCurrencies].join(", ")} instead of ${req.currency}; those fares were left out of the ranking.`,
    );
  }
  if (tally.failed > 0) {
    notes.push(`${tally.failed} price lookups failed (${[...tally.failureNotes].join("; ")}), so these results are partial.`);
  }
  // An empty sampled date is normal when other dates priced; it is only worth a note if nothing did.
  if (outOffers.length === 0) notes.push(...runner.emptyResultNotes);
  if (ranked.combinations.length === 0) notes.push("No fare combinations matched the dates and trip length.");
  if (ranked.combinations.some(hasEstimateLeg)) notes.push(ESTIMATE_NOTE);

  return {
    provider: { name: deps.provider.name, requested: deps.requested, fellBack: deps.fellBack },
    request: req,
    providerCalls: budget.calls,
    cacheHits: runner.cacheHits,
    cacheMisses: runner.cacheMisses,
    budget: { max: budget.max, used: budget.calls, exhausted: budget.exhausted },
    candidateAirports: candidates.length,
    lookupsPlanned: coverageLookups + verifyLookups,
    lookupsSkipped: tally.skipped + tally.haltedSkipped,
    lookupsFailed: tally.failed,
    partial: tally.skipped > 0 || tally.haltedSkipped > 0 || tally.failed > 0,
    notes,
    combinations: ranked.combinations,
    citiesWithoutReturn: ranked.citiesWithoutReturn,
    airports: airportSummaries(known, outOffers, inOffers, req.currency),
    origins: originSummaries(origins),
    outboundCalendar: outboundCalendar(outOffers, req.currency),
    verifiedCombinations: ranked.combinations.filter((c) => !hasEstimateLeg(c)).length,
  };
}
