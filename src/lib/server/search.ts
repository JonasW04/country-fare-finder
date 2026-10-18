import { airportsForCountry, candidateAirports } from "../airports";
import { bookingLink } from "../booking-link";
import { addDays, enumerateDates, sampleDates } from "../dates";
import { ProviderError } from "../providers/types";
import type { FlightProvider, Offer, OfferQuery } from "../providers/types";
import { OfferStore, rankCombinations } from "../ranking";
import type { Combination } from "../ranking";
import type { SearchRequest } from "../search-request";
import { CallBudget } from "./budget";
import type { TtlCache } from "./cache";
import type { SearchConfig } from "./config";
import { runBounded } from "./pool";
import { AttemptsExhaustedError, withRetry } from "./retry";

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
  /** How many of the returned combinations had their legs re-priced by an exact search. */
  verifiedCombinations: number;
}

interface Lookup {
  direction: "out" | "in";
  query: OfferQuery;
}

/**
 * Lookups are ordered by tier, then origin, then airport. Tier t prices one (date, nights)
 * sample for every airport, so a budget that runs out mid-search leaves every airport with
 * the same coverage instead of a few airports with many dates.
 */
function planLookups(req: SearchRequest, airports: string[], maxDatesPerLeg: number, rangeReturns: boolean): Lookup[] {
  const outDates = sampleDates(enumerateDates(req.earliest, req.latest), maxDatesPerLeg);
  const nights: number[] = [];
  for (let n = req.minNights; n <= req.maxNights; n++) nights.push(n);
  const nightSamples = sampleDates(nights.map(String), maxDatesPerLeg).map(Number);

  const origins = [req.origin, ...(req.secondOrigin ? [req.secondOrigin] : [])];
  const base = { cabin: req.cabin, adults: req.adults, currency: req.currency };
  const lookups: Lookup[] = [];
  outDates.forEach((outDate, tier) => {
    const backDate = addDays(outDate, nightSamples[tier % nightSamples.length] ?? req.minNights);
    for (const origin of origins) {
      for (const city of airports) {
        lookups.push({ direction: "out", query: { ...base, origin, destination: city, date: outDate } });
        if (!rangeReturns) {
          lookups.push({ direction: "in", query: { ...base, origin: city, destination: origin, date: backDate } });
        }
      }
    }
  });
  if (rangeReturns) {
    // The endpoint returns the cheapest fare inside a window, so one request per airport covers every
    // possible return date. MAX_DATES_PER_LEG only thins the outbound dates.
    const date = addDays(req.earliest, req.minNights);
    const dateTo = addDays(req.latest, req.maxNights);
    for (const origin of origins) {
      for (const city of airports) {
        lookups.push({ direction: "in", query: { ...base, origin: city, destination: origin, date, dateTo } });
      }
    }
  }
  return lookups;
}

function cacheKey(provider: string, q: OfferQuery): string {
  // Adults and currency change the price, so they belong in the key alongside the spec's fields.
  return [provider, q.origin, q.destination, q.date, q.dateTo ?? "", q.cabin, q.adults, q.currency].join("|");
}

async function callProvider(deps: SearchDeps, query: OfferQuery,
  budget: CallBudget,
  onNote: (message: string) => void,
): Promise<Offer[]> {
  const { config, provider } = deps;
  return withRetry(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.callTimeoutMs);
      try {
        return await provider.searchOffers(query, {
          signal: controller.signal,
          onNote,
          // Metered providers spend the budget themselves, once per real HTTP request.
          onRequest: provider.meteredRequests
            ? () => {
                if (!budget.tryConsume()) throw new AttemptsExhaustedError();
              }
            : undefined,
        });
      } catch (err) {
        // A timeout is transient, so give it the same treatment as a 5xx.
        if (controller.signal.aborted) throw new ProviderError("Provider call timed out", 504);
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
    {
      retries: config.retries,
      baseDelayMs: config.backoffMs,
      sleep: deps.sleep,
      beforeAttempt: provider.meteredRequests ? undefined : () => budget.tryConsume(),
    },
  );
}

export async function runSearch(req: SearchRequest, deps: SearchDeps): Promise<SearchResponse> {
  const origins = [req.origin, ...(req.secondOrigin ? [req.secondOrigin] : [])];
  const cap = deps.config.maxAirportsPerCountry;
  // A cap keeps the largest airports and collapses metro siblings so the cap buys distinct cities.
  const candidates = candidateAirports(req.country, origins, cap ?? Infinity, cap !== undefined);
  const budget = new CallBudget(deps.config.maxProviderCalls);
  // A metro query can return any airport of that metro, so offers must resolve for all of them.
  const metros = new Set(candidates.map((a) => a.metro));
  const known = airportsForCountry(req.country).filter((a) => metros.has(a.metro) && !origins.includes(a.iata));
  const store = new OfferStore(known);
  const queryCodes = candidates.map((a) => deps.provider.cityQueryCode?.(a.iata) ?? a.iata);
  const lookups = planLookups(req, queryCodes,deps.config.maxDatesPerLeg, Boolean(deps.provider.range));

  let cacheHits = 0;
  let cacheMisses = 0;
  let skipped = 0;
  let failed = 0;
  let haltedSkipped = 0;
  // Set by a provider error that makes every further request pointless (quota gone, key rejected).
  let haltReason: string | null = null;
  const foreignCurrencies = new Set<string>();
  const failureNotes = new Set<string>();
  const emptyResultNotes = new Set<string>();

  const tasks = lookups.map(({ direction, query }) => async () => {
    const key = cacheKey(deps.provider.name, query);
    let offers = deps.cache.get(key);
    if (offers) {
      cacheHits++;
    } else {
      cacheMisses++;
      if (haltReason) {
        haltedSkipped++;
        return;
      }
      try {
        offers = await callProvider(deps, query, budget, (m) => emptyResultNotes.add(m));
        deps.cache.set(key, offers);
      } catch (err) {
        if (err instanceof AttemptsExhaustedError) skipped++;
        else if (err instanceof ProviderError && err.stopsSearch) {
          haltReason ??= err.message;
          haltedSkipped++;
        } else {
          failed++;
          failureNotes.add(err instanceof Error ? err.message : "Provider call failed");
        }
        return;
      }
    }
    for (const offer of offers) {
      if (offer.currency !== req.currency) foreignCurrencies.add(offer.currency);
      const link = offer.bookingUrl ?? bookingLink(offer, req, deps.provider.name);
      store.add(direction, { ...offer, bookingUrl: link });
    }
  });
  await runBounded(tasks, deps.config.concurrency);

  const ranked = rankCombinations({
    outbound: store.offers("out"),
    inbound: store.offers("in"),
    airports: known,
    currency: req.currency,
    minNights: req.minNights,
    maxNights: req.maxNights,
    limit: req.limit,
  });

  const notes: string[] = [];
  if (deps.fellBack) {
    notes.push(`FLIGHT_PROVIDER=${deps.requested} was requested but credentials are missing, so mock data was used.`);
  }
  if (skipped > 0) {
    notes.push(
      `Provider call budget (${budget.max}) exhausted: ${skipped} of ${lookups.length} price lookups were skipped, so these results are partial.`,
    );
  }
  if (haltReason) notes.push(`${haltReason} ${haltedSkipped} of ${lookups.length} price lookups were skipped, so these results are partial.`);
  if (foreignCurrencies.size > 0) {
    notes.push(
      `The provider priced some fares in ${[...foreignCurrencies].join(", ")} instead of ${req.currency}; those fares were left out of the ranking.`,
    );
  }
  if (failed > 0) {
    notes.push(`${failed} price lookups failed (${[...failureNotes].join("; ")}), so these results are partial.`);
  }
  // An empty sampled date is normal when other dates priced; it is only worth a note if nothing did.
  if (store.offers("out").length === 0) notes.push(...emptyResultNotes);
  if (ranked.combinations.length === 0) notes.push("No fare combinations matched the dates and trip length.");

  return {
    provider: { name: deps.provider.name, requested: deps.requested, fellBack: deps.fellBack },
    request: req,
    providerCalls: budget.calls,
    cacheHits,
    cacheMisses,
    budget: { max: budget.max, used: budget.calls, exhausted: budget.exhausted },
    candidateAirports: candidates.length,
    lookupsPlanned: lookups.length,
    lookupsSkipped: skipped + haltedSkipped,
    lookupsFailed: failed,
    partial: skipped > 0 || haltedSkipped > 0 || failed > 0,
    notes,
    combinations: ranked.combinations,
    citiesWithoutReturn: ranked.citiesWithoutReturn,
    // Filled in by the search-engine work; empty until then so the response shape is stable.
    airports: [],
    origins: origins.map((iata) => ({ iata })),
    outboundCalendar: [],
    verifiedCombinations: 0,
  };
}
