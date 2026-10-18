import { describe, expect, it } from "vitest";
import { MockProvider } from "@/lib/providers/mock";
import { ProviderError } from "@/lib/providers/types";
import type { FlightProvider, Offer, OfferQuery } from "@/lib/providers/types";
import { parseSearchRequest } from "@/lib/search-request";
import type { SearchRequest } from "@/lib/search-request";
import { TtlCache } from "@/lib/server/cache";
import type { SearchConfig } from "@/lib/server/config";
import { readProviderSelection } from "@/lib/server/provider-select";
import { runSearch } from "@/lib/server/search";
import type { SearchDeps } from "@/lib/server/search";

const request: SearchRequest = {
  origin: "LHR",
  country: "IT",
  earliest: "2027-03-01",
  latest: "2027-03-05",
  minNights: 5,
  maxNights: 7,
  cabin: "ECONOMY",
  adults: 1,
  currency: "EUR",
  limit: 5,
};

const config: SearchConfig = {
  concurrency: 4,
  callTimeoutMs: 1000,
  retries: 2,
  backoffMs: 0,
  maxProviderCalls: 1000,
  cacheTtlMs: 60_000,
  maxDatesPerLeg: 2,
};

/** Counts calls and prices every route deterministically. */
class StubProvider implements FlightProvider {
  readonly name = "stub";
  calls: OfferQuery[] = [];
  constructor(private readonly behaviour: (q: OfferQuery, n: number) => Offer[] = defaultOffers) {}
  async searchOffers(q: OfferQuery): Promise<Offer[]> {
    this.calls.push(q);
    return this.behaviour(q, this.calls.length);
  }
}

function defaultOffers(q: OfferQuery): Offer[] {
  const price = 50 + (q.origin + q.destination).charCodeAt(3);
  return [{ origin: q.origin, destination: q.destination, date: q.date, price, currency: q.currency, carriers: ["ST"] }];
}

function deps(provider: FlightProvider, over: Partial<SearchConfig> = {}, cache = new TtlCache<Offer[]>(60_000)): SearchDeps {
  return { provider, requested: provider.name, fellBack: false, cache, config: { ...config, ...over }, sleep: async () => {} };
}

describe("runSearch", () => {
  it("prices every candidate and returns ranked combinations", async () => {
    const provider = new StubProvider();
    const res = await runSearch(request, deps(provider));

    expect(res.provider.name).toBe("stub");
    expect(res.providerCalls).toBe(provider.calls.length);
    expect(res.providerCalls).toBe(res.lookupsPlanned);
    expect(res.partial).toBe(false);
    expect(res.combinations.length).toBeGreaterThan(0);
    expect(res.combinations.length).toBeLessThanOrEqual(request.limit);
    const totals = res.combinations.map((c) => c.total);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
    expect(res.combinations[0]?.outbound.bookingUrl).toContain("https://");
  });

  it("serves a repeat search from cache without calling the provider", async () => {
    const provider = new StubProvider();
    const cache = new TtlCache<Offer[]>(60_000);
    const first = await runSearch(request, deps(provider, {}, cache));
    const callsAfterFirst = provider.calls.length;
    const second = await runSearch(request, deps(provider, {}, cache));

    expect(provider.calls.length).toBe(callsAfterFirst);
    expect(second.providerCalls).toBe(0);
    expect(second.cacheHits).toBe(first.lookupsPlanned);
    expect(second.cacheMisses).toBe(0);
    expect(second.combinations).toEqual(first.combinations);
  });

  it("stops at MAX_PROVIDER_CALLS and says the results are partial", async () => {
    const provider = new StubProvider();
    const res = await runSearch(request, deps(provider, { maxProviderCalls: 10 }));

    expect(provider.calls.length).toBe(10);
    expect(res.providerCalls).toBe(10);
    expect(res.budget).toEqual({ max: 10, used: 10, exhausted: true });
    expect(res.partial).toBe(true);
    expect(res.lookupsSkipped).toBe(res.lookupsPlanned - 10);
    expect(res.notes.join(" ")).toMatch(/budget \(10\) exhausted/);
  });

  it("spends retries from the same budget", async () => {
    const provider = new StubProvider(() => {
      throw new ProviderError("down", 503);
    });
    const res = await runSearch(request, deps(provider, { maxProviderCalls: 4, retries: 5 }));
    expect(provider.calls.length).toBe(4);
    expect(res.partial).toBe(true);
    expect(res.combinations).toEqual([]);
  });

  it("retries transient failures and still produces results", async () => {
    const provider = new StubProvider((q, n) => (n === 1 ? (() => { throw new ProviderError("busy", 429); })() : defaultOffers(q)));
    const res = await runSearch(request, deps(provider));
    expect(res.lookupsFailed).toBe(0);
    expect(res.providerCalls).toBe(res.lookupsPlanned + 1);
    expect(res.combinations.length).toBeGreaterThan(0);
  });

  it("reports permanent failures as partial without throwing", async () => {
    const provider = new StubProvider(() => {
      throw new ProviderError("Amadeus Flight offers request failed with HTTP 400", 400);
    });
    const res = await runSearch(request, deps(provider));
    expect(res.partial).toBe(true);
    expect(res.lookupsFailed).toBe(res.lookupsPlanned);
    expect(res.notes.join(" ")).toContain("HTTP 400");
  });

  it("covers each airport once before spending calls on extra dates", async () => {
    const provider = new StubProvider();
    await runSearch(request, deps(provider, { maxProviderCalls: 30, maxDatesPerLeg: 3 }));
    const outDates = new Set(provider.calls.filter((c) => c.origin === "LHR").map((c) => c.date));
    expect(outDates.size).toBe(1);
  });

  it("works with the mock provider and flags a fallback", async () => {
    const res = await runSearch(request, { ...deps(new MockProvider()), requested: "amadeus", fellBack: true });
    expect(res.provider).toEqual({ name: "mock", requested: "amadeus", fellBack: true });
    expect(res.notes.join(" ")).toMatch(/credentials are missing/);
    expect(res.combinations.length).toBeGreaterThan(0);
  });
});

describe("provider selection", () => {
  it("defaults to mock", () => {
    expect(readProviderSelection({}).provider.name).toBe("mock");
  });

  it("falls back to mock when amadeus is chosen without credentials", () => {
    const sel = readProviderSelection({ FLIGHT_PROVIDER: "amadeus" });
    expect(sel).toMatchObject({ requested: "amadeus", fellBack: true, credentialsPresent: false });
    expect(sel.provider.name).toBe("mock");
  });

  it("uses amadeus when credentials exist", () => {
    const sel = readProviderSelection({ FLIGHT_PROVIDER: "amadeus", AMADEUS_CLIENT_ID: "id", AMADEUS_CLIENT_SECRET: "secret" });
    expect(sel).toMatchObject({ fellBack: false, credentialsPresent: true });
    expect(sel.provider.name).toBe("amadeus");
  });
});

describe("parseSearchRequest", () => {
  const today = "2027-01-01";
  const valid = { origin: "lhr", country: "it", earliest: "2027-03-01", latest: "2027-03-05" };

  it("normalises and defaults", () => {
    const parsed = parseSearchRequest(valid, today);
    expect(parsed).toMatchObject({ ok: true, request: { origin: "LHR", country: "IT", cabin: "ECONOMY", currency: "EUR", adults: 1, limit: 10 } });
  });

  it("rejects bad input with readable errors", () => {
    const parsed = parseSearchRequest({ origin: "L", country: "ZZ", earliest: "2026-12-01", latest: "2026-11-01", minNights: "9", maxNights: "3" }, today);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.length).toBeGreaterThanOrEqual(4);
  });
});
