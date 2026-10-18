import { describe, expect, it } from "vitest";
import { candidateAirports, findAirport } from "@/lib/airports";
import { enumerateDates } from "@/lib/dates";
import type { FlightProvider, Offer, OfferQuery, RangeSupport } from "@/lib/providers/types";
import type { SearchRequest } from "@/lib/search-request";
import { TtlCache } from "@/lib/server/cache";
import type { SearchConfig } from "@/lib/server/config";
import { chunkWindow } from "@/lib/server/plan";
import { ESTIMATE_NOTE, runSearch } from "@/lib/server/search";
import type { SearchDeps } from "@/lib/server/search";

const request: SearchRequest = {
  origin: "LHR",
  country: "IT",
  earliest: "2027-03-01",
  latest: "2027-03-01",
  minNights: 5,
  maxNights: 5,
  cabin: "ECONOMY",
  adults: 1,
  currency: "EUR",
  limit: 5,
};

const config: SearchConfig = {
  concurrency: 1,
  callTimeoutMs: 1000,
  retries: 0,
  backoffMs: 0,
  maxProviderCalls: 1000,
  cacheTtlMs: 60_000,
  maxDatesPerLeg: 3,
  verifyTop: 0,
};

const METRO_CODES: Record<string, string> = { FCO: "ROM", CIA: "ROM", MXP: "MIL", LIN: "MIL", BGY: "MIL" };
const PER_DAY: RangeSupport = { maxDays: 31, perDay: true };

/** Records every query; `answer` decides the offers. */
class Stub implements FlightProvider {
  readonly name = "stub";
  calls: OfferQuery[] = [];
  cityQueryCode?: (iata: string) => string;
  constructor(
    private readonly answer: (q: OfferQuery) => Offer[],
    readonly range?: RangeSupport,
    metroCodes = false,
  ) {
    if (metroCodes) this.cityQueryCode = (iata) => METRO_CODES[iata] ?? iata;
  }
  async searchOffers(q: OfferQuery): Promise<Offer[]> {
    this.calls.push(q);
    return this.answer(q);
  }
}

const fare = (origin: string, destination: string, date: string, price: number, estimate = false): Offer => ({
  origin,
  destination,
  date,
  price,
  currency: "EUR",
  carriers: estimate ? [] : ["XX"],
  ...(estimate ? { estimate } : {}),
});

function deps(provider: FlightProvider, over: Partial<SearchConfig> = {}): SearchDeps {
  return { provider, requested: "stub", fellBack: false, cache: new TtlCache<Offer[]>(60_000), config: { ...config, ...over }, sleep: async () => {} };
}

describe("chunkWindow", () => {
  const days = (n: number) => enumerateDates("2027-03-01", "2027-12-31")[n - 1] ?? "";

  it("covers a 31-day per-day window in one chunk", () => {
    expect(chunkWindow(days(1), days(31), PER_DAY, 3)).toEqual([{ date: days(1), dateTo: days(31) }]);
  });

  it("splits a 45-day per-day window into two contiguous chunks of at most 31 days", () => {
    expect(chunkWindow(days(1), days(45), PER_DAY, 3)).toEqual([
      { date: days(1), dateTo: days(23) },
      { date: days(24), dateTo: days(45) },
    ]);
  });

  it("splits a cheapest-only window into maxDatesPerLeg chunks, never more than its days", () => {
    const cheapestOnly = { maxDays: 366, perDay: false };
    expect(chunkWindow(days(1), days(7), cheapestOnly, 3)).toEqual([
      { date: days(1), dateTo: days(3) },
      { date: days(4), dateTo: days(5) },
      { date: days(6), dateTo: days(7) },
    ]);
    expect(chunkWindow(days(1), days(2), cheapestOnly, 3)).toEqual([
      { date: days(1), dateTo: days(1) },
      { date: days(2), dateTo: days(2) },
    ]);
  });
});

describe("phase 2 returns", () => {
  it("skips cities without an outbound fare, asks cheapest first, and stays complete", async () => {
    // Capped to FCO, MXP, NAP, VCE; only Milan and Venice can be reached, Venice for less.
    const outPrices: Record<string, number> = { MXP: 80, VCE: 40 };
    const provider = new Stub((q) => {
      if (q.destination === "LHR") return [fare(q.origin, "LHR", "2027-03-06", 30)];
      const price = outPrices[q.destination];
      return price === undefined ? [] : [fare("LHR", q.destination, q.date, price)];
    }, PER_DAY);
    const res = await runSearch(request, deps(provider, { maxAirportsPerCountry: 4 }));

    expect(provider.calls.filter((q) => q.destination === "LHR").map((q) => q.origin)).toEqual(["VCE", "MXP"]);
    expect(res.lookupsPlanned).toBe(4 + 2);
    expect(res.lookupsSkipped).toBe(0);
    expect(res.partial).toBe(false);
    expect(res.combinations[0]).toMatchObject({ total: 70 });
  });

  it("sends range providers concrete airports and non-range providers metro codes", async () => {
    const real = (code: string) => ({ ROM: "FCO", MIL: "MXP" })[code] ?? code;
    const answer = (q: OfferQuery) => [fare(real(q.origin), real(q.destination), q.date, 50)];
    const codes = (p: Stub) => new Set(p.calls.flatMap((q) => [q.origin, q.destination]));

    const ranged = new Stub(answer, PER_DAY, true);
    await runSearch(request, deps(ranged));
    expect(codes(ranged)).not.toContain("ROM");
    expect(codes(ranged)).not.toContain("MIL");
    expect(codes(ranged)).toContain("CIA");

    const sampled = new Stub(answer, undefined, true);
    await runSearch(request, deps(sampled));
    const inbound = sampled.calls.filter((q) => q.destination === "LHR").map((q) => q.origin);
    expect(sampled.calls.filter((q) => q.origin === "LHR").map((q) => q.destination)).toContain("ROM");
    expect(inbound).toContain("MIL");
    expect(codes(sampled)).not.toContain("FCO");
  });
});

describe("phase 3 exact re-check", () => {
  // Calendar lows: Rome is cheapest both ways. Exact quotes: Rome outbound is far dearer, and the
  // Milan return has no exact quote, so its estimate stays.
  const calendar: Record<string, number> = { "LHR-FCO": 10, "LHR-MXP": 20, "FCO-LHR": 10, "MXP-LHR": 20 };
  const exact: Record<string, number> = { "LHR-FCO": 100, "LHR-MXP": 20, "FCO-LHR": 10 };
  const answer = (q: OfferQuery): Offer[] => {
    const route = `${q.origin}-${q.destination}`;
    const price = q.dateTo ? calendar[route] : exact[route];
    return price === undefined ? [] : [fare(q.origin, q.destination, q.date, price, Boolean(q.dateTo))];
  };
  const verify = { maxAirportsPerCountry: 2, verifyTop: 5 };

  it("replaces estimate legs with exact quotes, re-ranks, and counts verified combinations", async () => {
    const provider = new Stub(answer, PER_DAY);
    const res = await runSearch(request, deps(provider, verify));

    expect(provider.calls.filter((q) => !q.dateTo)).toHaveLength(4);
    expect(res.lookupsPlanned).toBe(2 + 2 + 4);
    expect(res.combinations.map((c) => `${c.flyIn.iata}-${c.flyOut.iata}:${c.total}`)).toEqual([
      "MXP-FCO:30",
      "MXP-MXP:40",
      "FCO-FCO:110",
      "FCO-MXP:120",
    ]);
    expect(res.verifiedCombinations).toBe(2);
    expect(res.notes).toContain(ESTIMATE_NOTE);
    expect(res.partial).toBe(false);
  });

  it("fills airports, origins and the outbound calendar from the re-checked fares", async () => {
    const provider = new Stub(answer, PER_DAY);
    const res = await runSearch({ ...request, secondOrigin: "MAD" }, deps(provider, verify));

    const known = candidateAirports("IT", ["LHR", "MAD"]).filter((a) => a.metro === "ROM" || a.metro === "MIL");
    expect(res.airports.map((a) => a.iata)).toEqual(known.map((a) => a.iata));
    expect(res.airports.find((a) => a.iata === "FCO")).toMatchObject({ cheapestOut: 100, cheapestIn: 10 });
    expect(res.airports.find((a) => a.iata === "MXP")).toMatchObject({ cheapestOut: 20, cheapestIn: 20 });
    expect(res.airports.find((a) => a.iata === "CIA")).not.toHaveProperty("cheapestOut");
    expect(res.airports.find((a) => a.iata === "CIA")).not.toHaveProperty("cheapestIn");

    const mad = findAirport("MAD");
    expect(mad).toBeDefined();
    expect(res.origins).toEqual([{ iata: "LHR" }, { iata: "MAD", city: mad?.city, lat: mad?.lat, lon: mad?.lon }]);
    expect(res.outboundCalendar).toEqual([{ date: "2027-03-01", price: 20 }]);
  });

  it("keeps estimates without going partial when the budget runs out during the re-check", async () => {
    const provider = new Stub(answer, PER_DAY);
    const res = await runSearch(request, deps(provider, { ...verify, maxProviderCalls: 5 }));

    expect(provider.calls).toHaveLength(5);
    expect(res.budget.exhausted).toBe(true);
    expect(res.partial).toBe(false);
    expect(res.lookupsSkipped).toBe(0);
    expect(res.notes).toContain(ESTIMATE_NOTE);
    expect(res.notes.join(" ")).not.toMatch(/budget/);
  });

  it("prices a 12-airport, 7-day, 5-10 night search in at most 34 calls", async () => {
    const perDay = (q: OfferQuery): Offer[] => {
      const price = 40 + (q.origin.charCodeAt(0) % 7) + (q.destination.charCodeAt(1) % 5);
      if (!q.dateTo) return [fare(q.origin, q.destination, q.date, price + 3)];
      return enumerateDates(q.date, q.dateTo).map((d, i) => fare(q.origin, q.destination, d, price + (i % 4), true));
    };
    const provider = new Stub(perDay, PER_DAY);
    const res = await runSearch(
      { ...request, earliest: "2027-03-01", latest: "2027-03-07", minNights: 5, maxNights: 10, limit: 10 },
      deps(provider, { maxAirportsPerCountry: 12, verifyTop: 5, concurrency: 4 }),
    );

    expect(provider.calls.filter((q) => q.dateTo)).toHaveLength(24);
    expect(res.providerCalls).toBeLessThanOrEqual(34);
    expect(res.partial).toBe(false);
    expect(res.combinations).toHaveLength(10);
    expect(res.outboundCalendar.map((d) => d.date)).toEqual(enumerateDates("2027-03-01", "2027-03-07"));
  });
});
