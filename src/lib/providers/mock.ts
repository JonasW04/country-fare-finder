import type { FlightProvider, Offer, OfferQuery } from "./types";

const CARRIERS = ["IB", "VY", "FR", "U2", "AF", "LH", "TP", "A3", "AZ", "TG"];

const CABIN_MULTIPLIER: Record<string, number> = {
  ECONOMY: 1,
  PREMIUM_ECONOMY: 1.6,
  BUSINESS: 3,
  FIRST: 4.5,
};

/** FNV-1a: small, stable across platforms, good enough to spread fares. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Deterministic value in [0, 1) for a seed string. */
function unit(seed: string): number {
  return hash(seed) / 0x100000000;
}

export class MockProvider implements FlightProvider {
  readonly name = "mock";

  async searchOffers(query: OfferQuery): Promise<Offer[]> {
    const { origin, destination, date, cabin, adults, currency } = query;
    const route = `${origin}-${destination}`;

    // A few routes have no service at all so callers see missing legs.
    if (unit(`nonstop:${route}`) < 0.06) return [];

    const base = 40 + unit(`base:${route}`) * 160;
    const dayWiggle = 0.8 + unit(`day:${route}:${date}`) * 0.6;
    const multiplier = CABIN_MULTIPLIER[cabin.toUpperCase()] ?? 1;
    const count = 1 + Math.floor(unit(`count:${route}:${date}`) * 3);

    const offers: Offer[] = [];
    for (let i = 0; i < count; i++) {
      const carrier = CARRIERS[hash(`carrier:${route}:${date}:${i}`) % CARRIERS.length] ?? "IB";
      const spread = 1 + i * 0.12 * (0.5 + unit(`spread:${route}:${date}:${i}`));
      const price = Math.round(base * dayWiggle * multiplier * spread * adults * 100) / 100;
      offers.push({ origin, destination, date, price, currency, carriers: [carrier] });
    }
    return offers.sort((a, b) => a.price - b.price);
  }
}
