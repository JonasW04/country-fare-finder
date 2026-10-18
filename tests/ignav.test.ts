import { describe, expect, it } from "vitest";
import fixture from "./fixtures/ignav-one-way.json";
import { airportsForCountry, candidateAirports } from "@/lib/airports";
import { IGNAV_ONE_WAY_URL, IgnavProvider, marketForCurrency } from "@/lib/providers/ignav";
import type { OfferQuery } from "@/lib/providers/types";
import type { SearchRequest } from "@/lib/search-request";
import { TtlCache } from "@/lib/server/cache";
import { loadSearchConfig } from "@/lib/server/config";
import { readProviderSelection } from "@/lib/server/provider-select";
import { runSearch } from "@/lib/server/search";
import type { SearchResponse } from "@/lib/server/search";

const KEY = "ignav-test-key-DO-NOT-LEAK";

const query = (over: Partial<OfferQuery> = {}): OfferQuery => ({
  origin: "OSL",
  destination: "FCO",
  date: "2026-11-20",
  cabin: "ECONOMY",
  adults: 1,
  currency: "USD",
  ...over,
});

interface Recorded {
  url: string;
  method: string | undefined;
  apiKey: string | null;
  body: Record<string, unknown>;
}

/** Scripted fetch: no network. Responses repeat the last entry once the script runs out. */
function stubFetch(...responses: (() => Response)[]) {
  const calls: Recorded[] = [];
  const impl: typeof fetch = async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method,
      apiKey: new Headers(init?.headers).get("X-Api-Key"),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    const make = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (!make) throw new Error("stubFetch needs at least one response");
    return make();
  };
  return { impl, calls };
}

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status });
const apiError = (status: number, code: string, message = "nope") => json({ error: { type: "x", code, message, field: null } }, status);

function firstCall(calls: Recorded[]): Recorded {
  const [call] = calls;
  if (!call) throw new Error("expected a fetch call");
  return call;
}

describe("IgnavProvider mapping", () => {
  it("maps the recorded response to the cheapest Offer and sends the key as a header", async () => {
    const { impl, calls } = stubFetch(json(fixture));
    const offers = await new IgnavProvider({ apiKey: KEY, fetchImpl: impl }).searchOffers(query());

    expect(offers).toEqual([
      { origin: "OSL", destination: "FCO", date: "2026-11-20", price: 97, currency: "USD", carriers: ["JU"] },
    ]);
    const call = firstCall(calls);
    expect(call.url).toBe(IGNAV_ONE_WAY_URL);
    expect(call.method).toBe("POST");
    expect(call.apiKey).toBe(KEY);
    expect(call.body).toEqual({
      origin: "OSL",
      destination: "FCO",
      departure_date: "2026-11-20",
      adults: 1,
      cabin_class: "economy",
      market: "US",
    });
  });

  it("picks the cheapest itinerary regardless of order and keeps ordered unique carriers", async () => {
    const reversed = { ...fixture, itineraries: [...fixture.itineraries].reverse() };
    const { impl } = stubFetch(json(reversed));
    const [offer] = await new IgnavProvider({ apiKey: KEY, fetchImpl: impl }).searchOffers(query());
    expect(offer?.price).toBe(97);

    const multi = {
      itineraries: [
        {
          price: { amount: 80, currency: "USD" },
          requires_self_transfer: true,
          outbound: {
            segments: [
              { marketing_carrier_code: "DY" },
              { marketing_carrier_code: "FR" },
              { marketing_carrier_code: "DY" },
            ],
          },
        },
      ],
    };
    const second = stubFetch(json(multi));
    const [selfTransfer] = await new IgnavProvider({ apiKey: KEY, fetchImpl: second.impl }).searchOffers(query());
    expect(selfTransfer).toMatchObject({ carriers: ["DY", "FR"], requiresSelfTransfer: true });
  });

  it("reports the currency the response returns, not the one requested", async () => {
    const { impl } = stubFetch(json(fixture));
    const [offer] = await new IgnavProvider({ apiKey: KEY, fetchImpl: impl }).searchOffers(query({ currency: "JPY" }));
    expect(offer?.currency).toBe("USD");
  });

  it("treats empty itineraries as no fare", async () => {
    const { impl } = stubFetch(json({ itineraries: [] }));
    expect(await new IgnavProvider({ apiKey: KEY, fetchImpl: impl }).searchOffers(query())).toEqual([]);
  });

  it("reports a changed response shape as a limitation", async () => {
    for (const body of [{ results: [] }, { itineraries: [{ price: { amount: "97" } }] }]) {
      const { impl } = stubFetch(json(body));
      const err = await new IgnavProvider({ apiKey: KEY, fetchImpl: impl }).searchOffers(query()).catch((e: unknown) => e);
      expect((err as Error).message).toMatch(/expected shape/);
    }
  });

  it("maps request currencies to markets, defaulting to US", () => {
    const expected = { EUR: "DE", NOK: "NO", SEK: "SE", DKK: "DK", GBP: "GB", USD: "US", CHF: "CH", PLN: "PL", JPY: "US" };
    for (const [currency, market] of Object.entries(expected)) expect(marketForCurrency(currency)).toBe(market);
  });

  it("sends the market for the requested currency", async () => {
    const { impl, calls } = stubFetch(json(fixture));
    await new IgnavProvider({ apiKey: KEY, fetchImpl: impl }).searchOffers(query({ currency: "NOK" }));
    expect(firstCall(calls).body.market).toBe("NO");
  });
});

describe("candidate ordering", () => {
  it("orders Spain by traffic rank, then size, then IATA, with unranked airports last", () => {
    const es = candidateAirports("ES");
    expect(es.slice(0, 6).map((a) => a.iata)).toEqual(["MAD", "BCN", "PMI", "AGP", "ALC", "LPA"]);
    const firstUnranked = es.findIndex((a) => a.rank === undefined);
    expect(firstUnranked).toBeGreaterThan(0);
    expect(es.slice(firstUnranked).every((a) => a.rank === undefined)).toBe(true);
    // Among unranked airports the old size-then-IATA order still applies.
    const tail = es.slice(firstUnranked);
    const sizes = tail.map((a) => ["large", "medium", "small"].indexOf(a.size));
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
  });

  it("puts the busiest Italian airports first, not the alphabetical large ones", () => {
    expect(candidateAirports("IT").slice(0, 4).map((a) => a.iata)).toEqual(["FCO", "MXP", "BGY", "NAP"]);
  });
});

describe("airport cap", () => {
  it("keeps the largest airports and collapses metro siblings", () => {
    const all = candidateAirports("IT");
    const capped = candidateAirports("IT", [], 6, true);
    expect(capped).toHaveLength(6);
    expect(new Set(capped.map((a) => a.metro)).size).toBe(6);
    // Every capped airport is the first of its metro in the largest-first ordering.
    for (const a of capped) expect(all.find((x) => x.metro === a.metro)?.iata).toBe(a.iata);
    expect(candidateAirports("IT", [], Infinity, true).length).toBeLessThan(all.length);
  });
});

describe("Ignav through the search engine", () => {
  const request: SearchRequest = {
    origin: "OSL",
    country: "IT",
    earliest: "2027-03-01",
    latest: "2027-03-05",
    minNights: 5,
    maxNights: 7,
    cabin: "ECONOMY",
    adults: 1,
    currency: "USD",
    limit: 5,
  };
  const selection = readProviderSelection({ FLIGHT_PROVIDER: "ignav", IGNAV_API_KEY: KEY });
  const defaults = loadSearchConfig({}, selection.defaults);

  const run = (impl: typeof fetch, over: Partial<typeof defaults> = {}): Promise<SearchResponse> =>
    runSearch(request, {
      provider: new IgnavProvider({ apiKey: KEY, fetchImpl: impl }),
      requested: "ignav",
      fellBack: false,
      cache: new TtlCache(defaults.cacheTtlMs),
      config: { ...defaults, backoffMs: 0, ...over },
      sleep: async () => {},
    });

  const priced = () =>
    stubFetch((): Response => new Response(JSON.stringify(fixture), { status: 200 }));

  it("costs at most 30 requests for a 41-airport country under default config", async () => {
    expect(airportsForCountry("IT")).toHaveLength(41);
    const { impl, calls } = priced();
    const res = await run(impl);

    expect(res.candidateAirports).toBe(6);
    expect(defaults.maxDatesPerLeg).toBe(2);
    expect(calls.length).toBe(24);
    expect(calls.length).toBeLessThanOrEqual(30);
    expect(res.providerCalls).toBe(calls.length);
    expect(res.partial).toBe(false);
  });

  it("lets env override the date and airport defaults", () => {
    const config = loadSearchConfig({ MAX_DATES_PER_LEG: "3", MAX_AIRPORTS_PER_COUNTRY: "10" }, selection.defaults);
    expect(config).toMatchObject({ maxDatesPerLeg: 3, maxAirportsPerCountry: 10 });
    expect(loadSearchConfig({}).maxAirportsPerCountry).toBeUndefined();
  });

  it("stops after a 402, returns partial results and says the quota is used up", async () => {
    const { impl, calls } = stubFetch(apiError(402, "billing_required"));
    const res = await run(impl, { concurrency: 1 });

    expect(calls).toHaveLength(1);
    expect(res.partial).toBe(true);
    expect(res.lookupsSkipped).toBe(res.lookupsPlanned);
    expect(res.notes.join(" ")).toContain("Ignav free quota (1000 requests/month) is used up");
  });

  it("keeps what it priced before the quota ran out", async () => {
    const ok = () => new Response(JSON.stringify(fixture), { status: 200 });
    const { impl, calls } = stubFetch(ok, ok, apiError(402, "billing_required"));
    const res = await run(impl, { concurrency: 1 });
    expect(calls).toHaveLength(3);
    expect(res.partial).toBe(true);
    expect(res.notes.join(" ")).toMatch(/free quota/);
  });

  it("gives one clear note for a 401 without retrying", async () => {
    const { impl, calls } = stubFetch(apiError(401, "invalid_api_key"));
    const res = await run(impl, { concurrency: 1 });

    expect(calls).toHaveLength(1);
    expect(res.notes.filter((n) => /rejected the API key/.test(n))).toHaveLength(1);
    expect(res.partial).toBe(true);
  });

  it("explains an unverified email for a 403 without retrying", async () => {
    const { impl, calls } = stubFetch(apiError(403, "email_not_verified"));
    const res = await run(impl, { concurrency: 1 });
    expect(calls).toHaveLength(1);
    expect(res.notes.join(" ")).toMatch(/email is not verified/);
  });

  it("retries a 429 with backoff, then gives up on that lookup", async () => {
    const { impl, calls } = stubFetch(apiError(429, "rate_limited"));
    const res = await run(impl, { concurrency: 1, maxProviderCalls: 3 });

    expect(calls).toHaveLength(3);
    expect(res.lookupsFailed).toBe(1);
    expect(res.notes.join(" ")).toContain("HTTP 429");
    expect(res.combinations).toEqual([]);
  });

  it("never lets the key into notes or the response, even when the API echoes it", async () => {
    const echo = (status: number, code = "boom") => () =>
      new Response(JSON.stringify({ error: { code: `${code}-${KEY}`, message: `bad key ${KEY}` } }), { status });
    const network: typeof fetch = async () => {
      throw new TypeError(`connect failed for key ${KEY}`);
    };
    const scripted = [stubFetch(echo(401)).impl, stubFetch(echo(500)).impl, stubFetch(echo(400)).impl, network];
    for (const impl of scripted) {
      const res = await run(impl, { concurrency: 1, maxProviderCalls: 4 });
      expect(JSON.stringify(res)).not.toContain(KEY);
    }
  });

  it("falls back to mock, labelled, when ignav is selected without a key", () => {
    const sel = readProviderSelection({ FLIGHT_PROVIDER: "ignav" });
    expect(sel).toMatchObject({ requested: "ignav", fellBack: true, credentialsPresent: false });
    expect(sel.provider.name).toBe("mock");
    expect(selection).toMatchObject({ fellBack: false, credentialsPresent: true });
    expect(selection.provider.name).toBe("ignav");
  });
});
