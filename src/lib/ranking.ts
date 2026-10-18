// Pure combination and ranking logic. No I/O, so every rule here is unit-testable.
import { nightsBetween } from "./dates";
import type { Airport } from "./airports";
import type { Offer } from "./providers/types";

// A 31-day fare calendar yields one offer per day per airport; a lower cap would drop days
// before trip lengths are paired.
export const DEFAULT_PER_CITY_CAP = 64;

export type Direction = "out" | "in";

export interface CityRef {
  iata: string;
  city: string;
  metro: string;
}

export interface Combination {
  rank: number;
  origin: string;
  flyIn: CityRef;
  flyOut: CityRef;
  total: number;
  currency: string;
  nights: number;
  openJaw: boolean;
  outbound: Offer;
  inbound: Offer;
}

export interface RankInput {
  outbound: Offer[];
  inbound: Offer[];
  airports: Airport[];
  currency: string;
  minNights: number;
  maxNights: number;
  limit: number;
}

export interface RankResult {
  combinations: Combination[];
  /** Cities that had outbound fares but no usable return leg. */
  citiesWithoutReturn: string[];
}

function indexAirports(airports: Airport[]): Map<string, Airport> {
  return new Map(airports.map((a) => [a.iata, a]));
}

function cityRef(a: Airport, iata: string): CityRef {
  return { iata, city: a.metroName, metro: a.metro };
}

function compareOffers(a: Offer, b: Offer): number {
  return a.price - b.price || a.date.localeCompare(b.date) || a.carriers.join().localeCompare(b.carriers.join());
}

/**
 * Keeps only the cheapest `cap` offers per (direction, origin, metro) while offers stream in,
 * so memory stays bounded no matter how many dates and providers are queried.
 */
export class OfferStore {
  private readonly byKey = new Map<string, Offer[]>();
  private readonly airports: Map<string, Airport>;

  constructor(
    airports: Airport[],
    private readonly cap: number = DEFAULT_PER_CITY_CAP,
  ) {
    this.airports = indexAirports(airports);
  }

  add(direction: Direction, offer: Offer): void {
    // The city side of the leg is the destination outbound and the origin on the way back.
    const cityIata = direction === "out" ? offer.destination : offer.origin;
    const home = direction === "out" ? offer.origin : offer.destination;
    const airport = this.airports.get(cityIata);
    if (!airport || !Number.isFinite(offer.price) || offer.price < 0) return;

    const key = `${direction}|${home}|${airport.metro}`;
    const list = this.byKey.get(key) ?? [];
    list.push(offer);
    list.sort(compareOffers);
    if (list.length > this.cap) list.length = this.cap;
    this.byKey.set(key, list);
  }

  offers(direction: Direction): Offer[] {
    return [...this.byKey.entries()].filter(([k]) => k.startsWith(`${direction}|`)).flatMap(([, v]) => v);
  }
}

function groupByCityAndHome(offers: Offer[], direction: Direction, airports: Map<string, Airport>) {
  const groups = new Map<string, { home: string; airport: Airport; cityIata: string; offers: Offer[] }>();
  for (const o of offers) {
    const cityIata = direction === "out" ? o.destination : o.origin;
    const home = direction === "out" ? o.origin : o.destination;
    const airport = airports.get(cityIata);
    if (!airport) continue;
    const key = `${home}|${airport.metro}`;
    const group = groups.get(key) ?? { home, airport, cityIata, offers: [] };
    group.offers.push(o);
    groups.set(key, group);
  }
  return groups;
}

function bestPair(outs: Offer[], ins: Offer[], minNights: number, maxNights: number) {
  let best: { out: Offer; back: Offer; total: number; nights: number } | null = null;
  for (const out of outs) {
    for (const back of ins) {
      const nights = nightsBetween(out.date, back.date);
      if (nights < minNights || nights > maxNights) continue;
      const total = Math.round((out.price + back.price) * 100) / 100;
      const better =
        !best ||
        total < best.total ||
        (total === best.total && (out.date < best.out.date || (out.date === best.out.date && back.date < best.back.date)));
      if (better) best = { out, back, total, nights };
    }
  }
  return best;
}

function byTotalThenNames(a: Combination, b: Combination): number {
  return (
    a.total - b.total ||
    a.flyIn.city.localeCompare(b.flyIn.city) ||
    a.flyOut.city.localeCompare(b.flyOut.city) ||
    a.origin.localeCompare(b.origin) ||
    a.outbound.date.localeCompare(b.outbound.date) ||
    a.inbound.date.localeCompare(b.inbound.date)
  );
}

/**
 * Best combination per (origin, fly-in metro, fly-out metro), cheapest first.
 * Airports in one metro are one city: the cheapest sibling's fare represents it.
 * Equal totals are ordered by city name so results do not shuffle between runs.
 */
export function rankCombinations(input: RankInput): RankResult {
  const airports = indexAirports(input.airports);
  const usable = (o: Offer) => o.currency === input.currency && Number.isFinite(o.price);
  const outGroups = groupByCityAndHome(input.outbound.filter(usable), "out", airports);
  const inGroups = groupByCityAndHome(input.inbound.filter(usable), "in", airports);

  const combos: Combination[] = [];
  for (const out of outGroups.values()) {
    for (const back of inGroups.values()) {
      if (out.home !== back.home) continue;
      const pair = bestPair(out.offers, back.offers, input.minNights, input.maxNights);
      if (!pair) continue;
      combos.push({
        rank: 0,
        origin: out.home,
        flyIn: cityRef(out.airport, pair.out.destination),
        flyOut: cityRef(back.airport, pair.back.origin),
        total: pair.total,
        currency: input.currency,
        nights: pair.nights,
        openJaw: out.airport.metro !== back.airport.metro,
        outbound: pair.out,
        inbound: pair.back,
      });
    }
  }

  combos.sort(byTotalThenNames);
  const combinations = combos.slice(0, Math.max(0, input.limit)).map((c, i) => ({ ...c, rank: i + 1 }));

  // A fly-in city that appears in no combination had no return fare that fit the trip length.
  const flownIn = new Set(combos.map((c) => `${c.origin}|${c.flyIn.metro}`));
  const missing = [...outGroups.values()]
    .filter((g) => !flownIn.has(`${g.home}|${g.airport.metro}`))
    .map((g) => g.airport.metroName);

  return { combinations, citiesWithoutReturn: [...new Set(missing)].sort() };
}

type LegRef = Pick<Offer, "origin" | "destination" | "date">;

export function legKey(leg: LegRef): string {
  return `${leg.origin}|${leg.destination}|${leg.date}`;
}

export function hasEstimateLeg(c: Combination): boolean {
  return Boolean(c.outbound.estimate || c.inbound.estimate);
}

/** Unique estimate legs of the first `top` combinations that still carry one, in rank order. */
export function estimateLegsToVerify(combinations: Combination[], top: number, attempted: ReadonlySet<string> = new Set()): Offer[] {
  // A leg whose exact search already came back empty keeps its estimate; asking again would cost the same.
  const open = (leg: Offer) => leg.estimate === true && !attempted.has(legKey(leg));
  const legs = new Map<string, Offer>();
  // Only the top `top` combinations matter: once those are exact (or tried), deeper ones can wait.
  for (const c of combinations.slice(0, Math.max(0, top))) {
    for (const leg of [c.outbound, c.inbound]) {
      if (open(leg) && !legs.has(legKey(leg))) legs.set(legKey(leg), leg);
    }
  }
  return [...legs.values()];
}

/** Cheapest usable exact (non-estimate) offer per leg, to stand in for that leg's calendar low. */
export function exactReplacements(offers: Offer[], currency: string): Map<string, Offer> {
  const best = new Map<string, Offer>();
  for (const o of offers) {
    if (o.estimate || o.currency !== currency || !Number.isFinite(o.price)) continue;
    const current = best.get(legKey(o));
    if (!current || compareOffers(o, current) < 0) best.set(legKey(o), o);
  }
  return best;
}

/**
 * Swaps each estimate leg for its exact quote when one exists, even a dearer one: the calendar low
 * was never bookable, so ranking must follow the quote.
 */
/**
 * Median ratio of exact fare to calendar low over the legs re-checked so far, kept inside [1, 2]:
 * a calendar low is a floor, and one odd quote should not double every other estimate.
 */
export function estimateMarkup(ratios: number[]): number {
  const finite = ratios.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return 1;
  const mid = Math.floor(finite.length / 2);
  const median = finite.length % 2 ? (finite[mid] ?? 1) : ((finite[mid - 1] ?? 1) + (finite[mid] ?? 1)) / 2;
  return Math.min(2, Math.max(1, median));
}

/** Estimate legs priced at `factor` times their calendar low, rounded to cents; exact legs untouched. */
export function scaleEstimates(offers: Offer[], factor: number): Offer[] {
  if (factor === 1) return offers;
  return offers.map((o) => (o.estimate ? { ...o, price: Math.round(o.price * factor * 100) / 100 } : o));
}

export function replaceEstimates(offers: Offer[], replacements: Map<string, Offer>): Offer[] {
  return offers.map((o) => (o.estimate ? (replacements.get(legKey(o)) ?? o) : o));
}
