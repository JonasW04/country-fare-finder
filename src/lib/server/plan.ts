import type { Airport } from "../airports";
import { addDays, enumerateDates, nightsBetween, sampleDates } from "../dates";
import type { FlightProvider, Offer, OfferQuery, RangeSupport } from "../providers/types";
import type { SearchRequest } from "../search-request";

export interface Lookup {
  direction: "out" | "in";
  query: OfferQuery;
}

export interface DateChunk {
  date: string;
  dateTo: string;
}

/** A city worth a return lookup: it had at least one usable outbound fare from this origin. */
export interface EligibleCity {
  origin: string;
  metro: string;
  cheapestOut: number;
}

export interface PlanContext {
  req: SearchRequest;
  origins: string[];
  /** Candidate airports, busiest first. */
  candidates: Airport[];
  provider: Pick<FlightProvider, "range" | "cityQueryCode">;
  maxDatesPerLeg: number;
}

/**
 * Splits `start..end` into contiguous chunks of near-equal size, one lookup each. A per-day range
 * needs only enough chunks to respect `maxDays`; a cheapest-only range is split into
 * `maxDatesPerLeg` chunks, because each chunk yields a single date.
 */
export function chunkWindow(start: string, end: string, range: RangeSupport, maxDatesPerLeg: number): DateChunk[] {
  const len = nightsBetween(start, end) + 1;
  if (len <= 0) return [];
  const k = Math.min(len, Math.max(Math.ceil(len / range.maxDays), range.perDay ? 1 : maxDatesPerLeg));
  const size = Math.floor(len / k);
  const chunks: DateChunk[] = [];
  let date = start;
  for (let i = 0; i < k; i++) {
    const days = size + (i < len % k ? 1 : 0);
    const dateTo = addDays(date, days - 1);
    chunks.push({ date, dateTo });
    date = addDays(dateTo, 1);
  }
  return chunks;
}

function baseQuery(req: SearchRequest) {
  return { cabin: req.cabin, adults: req.adults, currency: req.currency };
}

/** Metro codes cover sibling airports in one request, so each code is asked once. */
function queryCodes(airports: Airport[], provider: PlanContext["provider"]): string[] {
  return [...new Set(airports.map((a) => provider.cityQueryCode?.(a.iata) ?? a.iata))];
}

function nightSamples(req: SearchRequest, maxDatesPerLeg: number): number[] {
  const nights: number[] = [];
  for (let n = req.minNights; n <= req.maxNights; n++) nights.push(n);
  return sampleDates(nights.map(String), maxDatesPerLeg).map(Number);
}

/**
 * Chunk-major (or date-major) order: one pass prices every airport once before the next pass,
 * so a budget that runs out mid-search leaves every airport with the same coverage.
 */
export function planOutbound(ctx: PlanContext): Lookup[] {
  const { req, origins, candidates, provider, maxDatesPerLeg } = ctx;
  const base = baseQuery(req);
  const lookups: Lookup[] = [];
  if (provider.range) {
    // Range queries go to the concrete airport: metro codes are not accepted in calendar requests.
    for (const chunk of chunkWindow(req.earliest, req.latest, provider.range, maxDatesPerLeg)) {
      for (const origin of origins) {
        for (const a of candidates) lookups.push({ direction: "out", query: { ...base, origin, destination: a.iata, ...chunk } });
      }
    }
    return lookups;
  }
  const codes = queryCodes(candidates, provider);
  for (const date of sampleDates(enumerateDates(req.earliest, req.latest), maxDatesPerLeg)) {
    for (const origin of origins) {
      for (const destination of codes) lookups.push({ direction: "out", query: { ...base, origin, destination, date } });
    }
  }
  return lookups;
}

/**
 * Cities with a usable outbound fare, cheapest first, so a budget cut in phase 2 drops the
 * returns least likely to make the top results. Ties keep candidate order, then origin order.
 */
export function eligibleCities(
  outbound: Offer[],
  airports: Airport[],
  candidates: Airport[],
  origins: string[],
  currency: string,
): EligibleCity[] {
  const metroOf = new Map(airports.map((a) => [a.iata, a.metro]));
  const cheapest = new Map<string, number>();
  for (const o of outbound) {
    const metro = metroOf.get(o.destination);
    if (!metro || o.currency !== currency || !Number.isFinite(o.price)) continue;
    const key = `${o.origin}|${metro}`;
    cheapest.set(key, Math.min(cheapest.get(key) ?? Infinity, o.price));
  }
  const cities: EligibleCity[] = [];
  for (const metro of new Set(candidates.map((a) => a.metro))) {
    for (const origin of origins) {
      const price = cheapest.get(`${origin}|${metro}`);
      if (price !== undefined) cities.push({ origin, metro, cheapestOut: price });
    }
  }
  return cities.sort((a, b) => a.cheapestOut - b.cheapestOut);
}

/** Return lookups for the eligible cities only; a city with no way in needs no way back. */
export function planInbound(ctx: PlanContext, cities: EligibleCity[]): Lookup[] {
  const { req, candidates, provider, maxDatesPerLeg } = ctx;
  const base = baseQuery(req);
  const airportsOf = (metro: string) => candidates.filter((a) => a.metro === metro);
  const lookups: Lookup[] = [];
  if (provider.range) {
    const from = addDays(req.earliest, req.minNights);
    const to = addDays(req.latest, req.maxNights);
    for (const chunk of chunkWindow(from, to, provider.range, maxDatesPerLeg)) {
      for (const city of cities) {
        for (const a of airportsOf(city.metro)) {
          lookups.push({ direction: "in", query: { ...base, origin: a.iata, destination: city.origin, ...chunk } });
        }
      }
    }
    return lookups;
  }
  // Without ranges each sampled outbound date is paired with one sampled trip length, as in phase 1.
  const nights = nightSamples(req, maxDatesPerLeg);
  const outDates = sampleDates(enumerateDates(req.earliest, req.latest), maxDatesPerLeg);
  outDates.forEach((outDate, tier) => {
    const date = addDays(outDate, nights[tier % nights.length] ?? req.minNights);
    for (const city of cities) {
      for (const origin of queryCodes(airportsOf(city.metro), provider)) {
        lookups.push({ direction: "in", query: { ...base, origin, destination: city.origin, date } });
      }
    }
  });
  return lookups;
}
