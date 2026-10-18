import { describe, expect, it } from "vitest";
import calendarFixture from "./fixtures/ignav-calendar.json";
import fixture from "./fixtures/ignav-one-way.json";
import { airportsForCountry, candidateAirports } from "@/lib/airports";
import { IGNAV_CALENDAR_URL, IGNAV_ONE_WAY_URL, IgnavProvider, marketForCurrency } from "@/lib/providers/ignav";
import { ProviderError } from "@/lib/providers/types";
import type { OfferQuery } from "@/lib/providers/types";
import type { SearchRequest } from "@/lib/search-request";
import { TtlCache } from "@/lib/server/cache";
import { loadSearchConfig } from "@/lib/server/config";
import { readProviderSelection } from "@/lib/server/provider-select";
import { withRetry } from "@/lib/server/retry";
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

/** A minimal Ignav response whose single itinerary really flies `from` to `to`. */
const itineraryBody = (from: string, to: string, amount = 50) => ({
  itineraries: [
    {
      price: { amount, currency: "USD" },
      requires_self_transfer: false,
      outbound: {
        segments: [{ marketing_carrier_code: "XX", departure_airport: from, arrival_airport: to }],
      },
    },
  ],
});

/**
 * Answers calendar requests with a priced cell for every day of the range and one-way requests with a
 * single itinerary, priced by route so the ranking has a clear order. No network.
 */
function routedFetch() {
  const calls: Recorded[] = [];
  const price = (from: string, to: string) => 40 + ((from.charCodeAt(0) * 7 + to.charCodeAt(1) * 3) % 50);
  const impl: typeof fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url: String(input), method: init?.method, apiKey: new Headers(init?.headers).get("X-Api-Key"), body });
    const from = String(body.origin);
    const to = String(body.destination);
    if (String(input) === IGNAV_CALENDAR_URL) {
      const range = body.departure_date_range as { start: string; end: string };
      const days = [];
      for (let d = range.start; d <= range.end; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) {
        days.push({ departure_date: d, return_date: null, status: "priced", price: { amount: price(from, to), currency: "USD", status: "unverified" }, observed_at: null });
      }
      return new Response(JSON.stringify({ origin: from, destination: to, days, status: "complete", cache_hit: false }), { status: 200 });
    }
    // Exact fares sit 10% above the calendar low, the usual direction of the gap.
    return new Response(JSON.stringify(itineraryBody(from, to, Math.round(price(from, to) * 110) / 100)), { status: 200 });
  };
  return { impl, calls };
}

describe("metro queries", () => {
  it("queries the metro code and maps the real arrival airport back onto the offer", async () => {
    const { impl, calls } = stubFetch(json(itineraryBody("OSL", "CIA", 61)));
    const provider = new IgnavProvider({ apiKey: KEY, fetchImpl: impl });
    expect(provider.cityQueryCode("FCO")).toBe("ROM");
    expect(provider.cityQueryCode("MXP")).toBe("MIL");
    expect(provider.cityQueryCode("NAP")).toBe("NAP");
    // BKK is a grouping in the dataset, not an official metro code, so it is never sent as one.
    expect(provider.cityQueryCode("DMK")).toBe("DMK");

    const [offer] = await provider.searchOffers(query({ destination: "ROM" }));
    expect(firstCall(calls).body.destination).toBe("ROM");
    expect(offer).toMatchObject({ origin: "OSL", destination: "CIA", price: 61 });
  });

  it("maps the real departure airport on a return leg from a metro", async () => {
    const { impl } = stubFetch(json(itineraryBody("BGY", "OSL")));
    const [offer] = await new IgnavProvider({ apiKey: KEY, fetchImpl: impl }).searchOffers(
      query({ origin: "MIL", destination: "OSL" }),
    );
    expect(offer).toMatchObject({ origin: "BGY", destination: "OSL" });
  });

  it("ignores itineraries that end outside the requested metro", async () => {
    const { impl } = stubFetch(json(itineraryBody("OSL", "NAP")));
    expect(await new IgnavProvider({ apiKey: KEY, fetchImpl: impl }).searchOffers(query({ destination: "ROM" }))).toEqual([]);
  });

  it("asks the calendar for concrete airports and still ranks metro siblings as one city", async () => {
    const { impl, calls } = routedFetch();
    const selection = readProviderSelection({ FLIGHT_PROVIDER: "ignav", IGNAV_API_KEY: KEY });
    const res = await runSearch(
      { origin: "OSL", country: "IT", earliest: "2027-03-01", latest: "2027-03-05", minNights: 5, maxNights: 7, cabin: "ECONOMY", adults: 1, currency: "USD", limit: 100 },
      {
        provider: new IgnavProvider({ apiKey: KEY, fetchImpl: impl }),
        requested: "ignav",
        fellBack: false,
        cache: new TtlCache(60_000),
        config: { ...loadSearchConfig({}, selection.defaults), backoffMs: 0, maxAirportsPerCountry: 6 },
        sleep: async () => {},
      },
    );
    // A calendar cell cannot say which airport of a metro it priced, so metro codes are never sent to it.
    const calendarCodes = calls.filter((c) => c.url === IGNAV_CALENDAR_URL).flatMap((c) => [c.body.origin, c.body.destination]);
    expect(calendarCodes.some((code) => code === "ROM" || code === "MIL" || code === "PAR")).toBe(false);
    expect(res.combinations.map((c) => c.flyIn)).toContainEqual(expect.objectContaining({ iata: "FCO", metro: "ROM" }));
    expect(res.partial).toBe(false);
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

  it("defaults to the 12 busiest metros, one calendar per direction, and exact prices for the top 5", async () => {
    expect(airportsForCountry("IT")).toHaveLength(41);
    expect(selection.defaults).toEqual({ maxAirportsPerCountry: 12, verifyTop: 5 });
    const { impl, calls } = routedFetch();
    const res = await run(impl);

    expect(res.candidateAirports).toBe(12);
    const calendars = calls.filter((c) => c.url === IGNAV_CALENDAR_URL);
    const outbound = calendars.filter((c) => c.body.origin === "OSL").map((c) => c.body.destination);
    expect(outbound.slice(0, 6)).toEqual(["FCO", "MXP", "NAP", "VCE", "CTA", "BLQ"]);
    // The 5-day window and the 7-day return window (03-06..03-12) each fit one calendar request.
    expect(calendars).toHaveLength(24);
    const exact = calls.filter((c) => c.url === IGNAV_ONE_WAY_URL);
    expect(exact.length).toBeGreaterThan(0);
    expect(exact.length).toBeLessThanOrEqual(10);
    expect(res.providerCalls).toBe(calls.length);
    expect(res.providerCalls).toBeLessThanOrEqual(34);
    expect(res.verifiedCombinations).toBe(5);
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
    expect(res.notes.join(" ")).toContain("Ignav billing is required: the one-time 1,000 free requests are used up");
  });

  it("keeps what it priced before the quota ran out", async () => {
    const ok = () => new Response(JSON.stringify(fixture), { status: 200 });
    const { impl, calls } = stubFetch(ok, ok, apiError(402, "billing_required"));
    const res = await run(impl, { concurrency: 1 });
    expect(calls).toHaveLength(3);
    expect(res.partial).toBe(true);
    expect(res.notes.join(" ")).toMatch(/billing is required/);
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

  it("stops at once on a monthly spending limit 429 instead of retrying", async () => {
    const { impl, calls } = stubFetch(apiError(429, "monthly_spend_limit_reached"));
    const res = await run(impl, { concurrency: 1, maxProviderCalls: 5 });

    expect(calls).toHaveLength(1);
    expect(res.partial).toBe(true);
    expect(res.lookupsSkipped).toBe(res.lookupsPlanned);
    expect(res.notes.join(" ")).toContain("Ignav monthly spending limit reached.");
  });

  it("retries a 424 unable_to_complete_request but not unsupported_search", async () => {
    // Driven through withRetry directly so the count does not depend on how many lookups the engine plans.
    const attempts = async (code: string) => {
      const { impl, calls } = stubFetch(apiError(424, code));
      const provider = new IgnavProvider({ apiKey: KEY, fetchImpl: impl });
      await withRetry(() => provider.searchOffers(query()), { retries: 2, baseDelayMs: 0, sleep: async () => {} }).catch(() => {});
      return calls.length;
    };
    expect(await attempts("unable_to_complete_request")).toBe(3);
    expect(await attempts("unsupported_search")).toBe(1);
  });

  it("falls back to mock, labelled, when ignav is selected without a key", () => {
    const sel = readProviderSelection({ FLIGHT_PROVIDER: "ignav" });
    expect(sel).toMatchObject({ requested: "ignav", fellBack: true, credentialsPresent: false });
    expect(sel.provider.name).toBe("mock");
    expect(selection).toMatchObject({ fellBack: false, credentialsPresent: true });
    expect(selection.provider.name).toBe("ignav");
  });
});

describe("Ignav fare calendar", () => {
  const ranged = (over: Partial<OfferQuery> = {}) => query({ currency: "EUR", dateTo: "2026-12-10", ...over });

  it("posts the window to the calendar endpoint with exactly the documented keys", async () => {
    const { impl, calls } = stubFetch(json(calendarFixture));
    let requests = 0;
    await new IgnavProvider({ apiKey: KEY, fetchImpl: impl }).searchOffers(ranged(), { onRequest: () => requests++ });

    const call = firstCall(calls);
    expect(call.url).toBe(IGNAV_CALENDAR_URL);
    expect(call.method).toBe("POST");
    expect(call.apiKey).toBe(KEY);
    expect(call.body).toEqual({
      origin: "OSL",
      destination: "FCO",
      departure_date_range: { start: "2026-11-20", end: "2026-12-10" },
      adults: 1,
      cabin_class: "economy",
      market: "DE",
    });
    expect(call.body).not.toHaveProperty("stay_days");
    expect(requests).toBe(1);
  });

  it("declares a 31-day per-day range", () => {
    expect(new IgnavProvider({ apiKey: KEY }).range).toEqual({ maxDays: 31, perDay: true });
  });

  it("keeps only priced days as carrier-less estimates", async () => {
    const { impl } = stubFetch(json(calendarFixture));
    const offers = await new IgnavProvider({ apiKey: KEY, fetchImpl: impl }).searchOffers(ranged());
    expect(offers).toEqual([
      { origin: "OSL", destination: "FCO", date: "2026-11-20", price: 97, currency: "EUR", carriers: [], estimate: true },
      { origin: "OSL", destination: "FCO", date: "2026-11-22", price: 84.5, currency: "EUR", carriers: [], estimate: true },
    ]);
  });

  it("reports a changed calendar shape as a limitation", async () => {
    const { impl } = stubFetch(json({ days: [{ departure_date: "2026-11-20", status: "priced", price: { amount: "97" } }] }));
    await expect(new IgnavProvider({ apiKey: KEY, fetchImpl: impl }).searchOffers(ranged())).rejects.toThrow(/expected shape/);
  });

  it("still uses the one-way endpoint without dateTo", async () => {
    const { impl, calls } = stubFetch(json(fixture));
    await new IgnavProvider({ apiKey: KEY, fetchImpl: impl }).searchOffers(query());
    expect(firstCall(calls).url).toBe(IGNAV_ONE_WAY_URL);
  });

  it("refuses a metro code for a range query, without a request", async () => {
    const { impl, calls } = stubFetch(json(calendarFixture));
    const provider = new IgnavProvider({ apiKey: KEY, fetchImpl: impl });
    for (const over of [{ destination: "ROM" }, { origin: "PAR" }]) {
      const err = await provider.searchOffers(ranged(over)).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ProviderError);
      expect(err).toMatchObject({ status: 400, stopsSearch: false });
      expect(String((err as Error).message)).toMatch(/concrete airport/);
    }
    expect(calls).toHaveLength(0);
  });

  it("explains a 402 as billing, and keeps the key out of every calendar error", async () => {
    const provider = (status: number, code: string) =>
      new IgnavProvider({
        apiKey: KEY,
        fetchImpl: stubFetch(() => new Response(JSON.stringify({ error: { code: `${code}-${KEY}`, message: `key ${KEY}` } }), { status })).impl,
      });
    const billing = await provider(402, "billing_required").searchOffers(ranged()).catch((e: unknown) => e);
    expect(billing).toMatchObject({ status: 402, stopsSearch: true });
    expect((billing as Error).message).toBe(
      "Ignav billing is required: the one-time 1,000 free requests are used up or billing is blocked.",
    );
    for (const [status, code] of [[429, "monthly_spend_limit_reached"], [424, "unable_to_complete_request"], [424, "unsupported_search"], [401, "x"]] as const) {
      const err = await provider(status, code).searchOffers(ranged()).catch((e: unknown) => e);
      expect(String((err as Error).message)).not.toContain(KEY);
    }
  });
});
