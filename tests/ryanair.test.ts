import { describe, expect, it } from "vitest";
import fixture from "./fixtures/ryanair-one-way-fares.json";
import { RYANAIR_FARES_URL, RyanairProvider } from "@/lib/providers/ryanair";
import { ProviderError } from "@/lib/providers/types";
import type { OfferQuery } from "@/lib/providers/types";
import type { SearchRequest } from "@/lib/search-request";
import { TtlCache } from "@/lib/server/cache";
import type { SearchConfig } from "@/lib/server/config";
import { readProviderSelection } from "@/lib/server/provider-select";
import { runSearch } from "@/lib/server/search";

const query = (over: Partial<OfferQuery> = {}): OfferQuery => ({
  origin: "OSL",
  destination: "FCO",
  date: "2027-03-02",
  cabin: "ECONOMY",
  adults: 1,
  currency: "EUR",
  ...over,
});

interface Recorded {
  url: URL;
  userAgent: string | null;
}

/** Stubs fetch with scripted responses, in order; the last one repeats. No network is touched. */
function stubFetch(...responses: (() => Response)[]) {
  const calls: Recorded[] = [];
  const impl: typeof fetch = async (input, init) => {
    calls.push({ url: new URL(String(input)), userAgent: new Headers(init?.headers).get("User-Agent") });
    const make = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (!make) throw new Error("stubFetch needs at least one response");
    return make();
  };
  return { impl, calls };
}

function firstCall(calls: Recorded[]): Recorded {
  const [call] = calls;
  if (!call) throw new Error("expected a fetch call");
  return call;
}

const json = (body: unknown, status = 200) => () =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("RyanairProvider", () => {
  it("maps a recorded fare to the internal Offer shape", async () => {
    const { impl, calls } = stubFetch(json(fixture));
    const offers = await new RyanairProvider({ fetchImpl: impl }).searchOffers(query());

    expect(offers).toEqual([
      { origin: "OSL", destination: "FCO", date: "2027-03-02", price: 23.99, currency: "EUR", carriers: ["FR"] },
    ]);
    const { url, userAgent } = firstCall(calls);
    expect(`${url.origin}${url.pathname}`).toBe(RYANAIR_FARES_URL);
    expect(url.searchParams.get("departureAirportIataCode")).toBe("OSL");
    expect(url.searchParams.get("arrivalCountryCode")).toBe("IT");
    expect(url.searchParams.get("outboundDepartureDateFrom")).toBe("2027-03-02");
    expect(url.searchParams.get("outboundDepartureDateTo")).toBe("2027-03-02");
    expect(userAgent).toMatch(/Mozilla/);
  });

  it("skips fares to airports the dataset does not contain", async () => {
    const { impl } = stubFetch(json(fixture));
    const provider = new RyanairProvider({ fetchImpl: impl });
    // The fixture holds a ZZZ fare at 9.99; it must never surface as an offer for a dataset airport.
    const all = [...(await provider.searchOffers(query())), ...(await provider.searchOffers(query({ destination: "BGY" })))];
    expect(all.map((o) => o.destination)).toEqual(["FCO", "BGY"]);
  });

  it("shares one country-wide call between airports of that country", async () => {
    const { impl, calls } = stubFetch(json(fixture));
    const provider = new RyanairProvider({ fetchImpl: impl });
    const [rome, milan] = await Promise.all([
      provider.searchOffers(query({ destination: "FCO" })),
      provider.searchOffers(query({ destination: "BGY" })),
    ]);
    expect(calls).toHaveLength(1);
    expect(rome.map((o) => o.price)).toEqual([23.99]);
    expect(milan.map((o) => o.price)).toEqual([41.5]);
  });

  it("prices a return to an origin outside the dataset by airport", async () => {
    const { impl, calls } = stubFetch(json({ fares: [] }));
    await new RyanairProvider({ fetchImpl: impl }).searchOffers(query({ origin: "FCO", destination: "OSL" }));
    const { url } = firstCall(calls);
    expect(url.searchParams.get("arrivalAirportIataCode")).toBe("OSL");
    expect(url.searchParams.has("arrivalCountryCode")).toBe(false);
  });

  it("treats an empty fares array as no offers, not an error", async () => {
    const { impl } = stubFetch(json({ fares: [] }));
    expect(await new RyanairProvider({ fetchImpl: impl }).searchOffers(query())).toEqual([]);
  });

  it("reports a schema mismatch as a provider limitation", async () => {
    for (const body of [{ results: [] }, { fares: [{ outbound: { price: { value: "23.99" } } }] }, "nope"]) {
      const { impl } = stubFetch(json(body));
      const err = await new RyanairProvider({ fetchImpl: impl }).searchOffers(query()).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).message).toMatch(/expected shape/);
      expect((err as ProviderError).status).toBeUndefined();
    }
  });

  it("does not cache a failed call", async () => {
    const { impl, calls } = stubFetch(json({}, 429), json(fixture));
    const provider = new RyanairProvider({ fetchImpl: impl });
    await expect(provider.searchOffers(query())).rejects.toMatchObject({ status: 429 });
    expect(await provider.searchOffers(query())).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });
});

describe("Ryanair through the search engine", () => {
  const request: SearchRequest = {
    origin: "OSL",
    country: "IT",
    earliest: "2027-03-02",
    latest: "2027-03-02",
    minNights: 5,
    maxNights: 5,
    cabin: "ECONOMY",
    adults: 1,
    currency: "EUR",
    limit: 5,
  };
  const config: SearchConfig = {
    concurrency: 2,
    callTimeoutMs: 1000,
    retries: 2,
    backoffMs: 0,
    maxProviderCalls: 1000,
    cacheTtlMs: 60_000,
    maxDatesPerLeg: 1,
  };

  it("retries a 429, then surrenders with a partial result and a note, inventing no fare", async () => {
    const { impl, calls } = stubFetch(json({}, 429));
    const res = await runSearch(request, {
      provider: new RyanairProvider({ fetchImpl: impl }),
      requested: "ryanair",
      fellBack: false,
      cache: new TtlCache(config.cacheTtlMs),
      config,
      sleep: async () => {},
    });

    // Every lookup retries up to retries + 1 attempts before giving up.
    expect(calls.length).toBeGreaterThanOrEqual(config.retries + 1);
    expect(res.combinations).toEqual([]);
    expect(res.partial).toBe(true);
    expect(res.lookupsFailed).toBeGreaterThan(0);
    expect(res.notes.join(" ")).toMatch(/429/);
  });

  it("marks a 403 partial without retrying", async () => {
    const { impl, calls } = stubFetch(json({}, 403));
    const res = await runSearch(request, {
      provider: new RyanairProvider({ fetchImpl: impl }),
      requested: "ryanair",
      fellBack: false,
      cache: new TtlCache(config.cacheTtlMs),
      config,
      sleep: async () => {},
    });
    expect(res.partial).toBe(true);
    expect(res.notes.join(" ")).toMatch(/403/);
    expect(res.combinations).toEqual([]);
    expect(calls.length).toBeLessThanOrEqual(res.lookupsPlanned);
  });
});

describe("provider selection", () => {
  it("selects ryanair without credentials and gives it concurrency 2", () => {
    const sel = readProviderSelection({ FLIGHT_PROVIDER: "ryanair" });
    expect(sel.provider.name).toBe("ryanair");
    expect(sel.fellBack).toBe(false);
    expect(sel.credentialsPresent).toBe(false);
    expect(sel.defaultConcurrency).toBe(2);
  });

  it("keeps mock as the default", () => {
    expect(readProviderSelection({}).provider.name).toBe("mock");
  });
});
