import { describe, expect, it } from "vitest";
import fixture from "./fixtures/ryanair-one-way-fares.json";
import { candidateAirports } from "@/lib/airports";
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
    // Uppercase silently returns zero fares on the live endpoint, so the code must go out lowercase.
    expect(url.searchParams.get("arrivalCountryCode")).toBe("it");
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
    await new RyanairProvider({ fetchImpl: impl }).searchOffers(query({ origin: "FCO", destination: "QQQ" }));
    const { url } = firstCall(calls);
    expect(url.searchParams.get("arrivalAirportIataCode")).toBe("QQQ");
    expect(url.searchParams.has("arrivalCountryCode")).toBe(false);
  });

  it("treats an empty fares array as no offers, not an error, and notes an empty country answer", async () => {
    const { impl } = stubFetch(json({ fares: [] }));
    const notes: string[] = [];
    const offers = await new RyanairProvider({ fetchImpl: impl }).searchOffers(query(), { onNote: (m) => notes.push(m) });
    expect(offers).toEqual([]);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/no fares from OSL to country it/);
  });

  it("does not note an empty answer for an airport-specific call", async () => {
    const { impl } = stubFetch(json({ fares: [] }));
    const notes: string[] = [];
    await new RyanairProvider({ fetchImpl: impl }).searchOffers(query({ origin: "FCO", destination: "QQQ" }), {
      onNote: (m) => notes.push(m),
    });
    expect(notes).toEqual([]);
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
    origin: "QQQ",
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
    verifyTop: 0,
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

describe("Ryanair request-based budget and return windows", () => {
  const request: SearchRequest = {
    origin: "QQQ",
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
    concurrency: 2,
    callTimeoutMs: 1000,
    retries: 2,
    backoffMs: 0,
    maxProviderCalls: 60,
    cacheTtlMs: 60_000,
    maxDatesPerLeg: 3,
    verifyTop: 0,
  };
  const airportCount = candidateAirports("IT", ["QQQ"]).length;

  const leg = (from: string, to: string, date: string, value: number) => ({
    outbound: {
      departureAirport: { iataCode: from },
      arrivalAirport: { iataCode: to },
      departureDate: `${date}T10:00:00`,
      price: { value, currencyCode: "EUR" },
    },
  });

  /** Country calls answer with FCO on the requested day; per-airport return calls with a fare inside the window. */
  function fareFetch() {
    const calls: URL[] = [];
    const impl: typeof fetch = async (input) => {
      const url = new URL(String(input));
      calls.push(url);
      const from = url.searchParams.get("departureAirportIataCode") ?? "";
      const day = url.searchParams.get("outboundDepartureDateFrom") ?? "";
      const fares = url.searchParams.has("arrivalCountryCode")
        ? [leg(from, "FCO", day, 20)]
        : from === "FCO"
          ? [leg("FCO", "QQQ", "2027-03-08", 30)]
          : [];
      return new Response(JSON.stringify({ fares }), { status: 200 });
    };
    return { impl, calls };
  }

  const run = (maxProviderCalls: number, impl: typeof fetch) =>
    runSearch(request, {
      provider: new RyanairProvider({ fetchImpl: impl }),
      requested: "ryanair",
      fellBack: false,
      cache: new TtlCache(config.cacheTtlMs),
      config: { ...config, maxProviderCalls },
      sleep: async () => {},
    });

  it("prices the country in three outbound chunks and asks returns only where an outbound fare exists", async () => {
    const { impl, calls } = fareFetch();
    const res = await run(60, impl);

    // Only FCO has an outbound fare, so returns go to the Rome airports alone: FCO and CIA, three chunks each.
    expect(airportCount).toBeGreaterThan(3);
    expect(calls).toHaveLength(3 + 2 * 3);
    expect(res.providerCalls).toBe(calls.length);
    expect(res.budget).toEqual({ max: 60, used: calls.length, exhausted: false });
    expect(res.lookupsPlanned).toBe(3 * airportCount + 2 * 3);
    expect(res.lookupsPlanned).toBeGreaterThan(res.providerCalls);
    expect(res.lookupsSkipped).toBe(0);
    expect(res.partial).toBe(false);
    expect(res.combinations.length).toBeGreaterThan(0);
  });

  it("splits the outbound and return windows into contiguous chunks", async () => {
    const { impl, calls } = fareFetch();
    await run(60, impl);

    const window = (u: URL) => `${u.searchParams.get("outboundDepartureDateFrom")}..${u.searchParams.get("outboundDepartureDateTo")}`;
    const returns = calls.filter((u) => !u.searchParams.has("arrivalCountryCode"));
    for (const url of returns) expect(url.searchParams.get("arrivalAirportIataCode")).toBe("QQQ");
    // earliest + minNights through latest + maxNights, 7 days in 3 chunks.
    expect([...new Set(returns.map(window))].sort()).toEqual(["2027-03-06..2027-03-08", "2027-03-09..2027-03-10", "2027-03-11..2027-03-12"]);
    expect([...new Set(returns.map((u) => u.searchParams.get("departureAirportIataCode")))].sort()).toEqual(["CIA", "FCO"]);
    const outbound = calls.filter((u) => u.searchParams.has("arrivalCountryCode"));
    expect(outbound.map(window).sort()).toEqual(["2027-03-01..2027-03-02", "2027-03-03..2027-03-04", "2027-03-05..2027-03-05"]);
  });

  it("stops at the request budget and reports the rest as skipped", async () => {
    const { impl, calls } = fareFetch();
    const res = await run(5, impl);

    expect(calls).toHaveLength(5);
    expect(res.providerCalls).toBe(5);
    expect(res.budget).toEqual({ max: 5, used: 5, exhausted: true });
    expect(res.lookupsSkipped).toBeGreaterThan(0);
    expect(res.partial).toBe(true);
    expect(res.notes.join(" ")).toMatch(/budget \(5\) exhausted/);
  });

  it("surfaces an empty country answer in the response notes, once per origin", async () => {
    const impl: typeof fetch = async () => new Response(JSON.stringify({ fares: [] }), { status: 200 });
    const res = await run(60, impl);
    const emptyNotes = res.notes.filter((n) => /no fares from QQQ to country it/.test(n));
    expect(emptyNotes).toHaveLength(1);
    expect(res.combinations).toEqual([]);
  });

  it("adds no empty-country note when one sampled date is empty but another returns fares", async () => {
    const impl: typeof fetch = async (input) => {
      const url = new URL(String(input));
      const from = url.searchParams.get("departureAirportIataCode") ?? "";
      const day = url.searchParams.get("outboundDepartureDateFrom") ?? "";
      const fares = !url.searchParams.has("arrivalCountryCode")
        ? from === "FCO"
          ? [leg("FCO", "QQQ", "2027-03-08", 30)]
          : []
        : day === "2027-03-03"
          ? []
          : [leg(from, "FCO", day, 20)];
      return new Response(JSON.stringify({ fares }), { status: 200 });
    };
    const res = await run(60, impl);
    expect(res.combinations.length).toBeGreaterThan(0);
    expect(res.notes.filter((n) => /no fares from/.test(n))).toEqual([]);
  });

  it("counts a retry as another request", async () => {
    let n = 0;
    const impl: typeof fetch = async () => {
      n++;
      return new Response(n === 1 ? "{}" : JSON.stringify({ fares: [] }), { status: n === 1 ? 429 : 200 });
    };
    const provider = new RyanairProvider({ fetchImpl: impl });
    const res = await runSearch({ ...request, latest: "2027-03-01" }, {
      provider,
      requested: "ryanair",
      fellBack: false,
      cache: new TtlCache(config.cacheTtlMs),
      config: { ...config, maxDatesPerLeg: 1 },
      sleep: async () => {},
    });
    expect(res.providerCalls).toBe(n);
    expect(res.lookupsFailed).toBe(0);
  });
});

describe("provider selection", () => {
  it("selects ryanair without credentials and gives it concurrency 2 and 90 calls", () => {
    const sel = readProviderSelection({ FLIGHT_PROVIDER: "ryanair" });
    expect(sel.provider.name).toBe("ryanair");
    expect(sel.fellBack).toBe(false);
    expect(sel.credentialsPresent).toBe(false);
    expect(sel.defaults).toEqual({ concurrency: 2, maxProviderCalls: 90 });
  });

  it("keeps mock as the default", () => {
    expect(readProviderSelection({}).provider.name).toBe("mock");
  });
});
