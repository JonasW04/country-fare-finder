import { describe, expect, it, vi, afterEach } from "vitest";
import { GET } from "@/app/api/search/route";
import { readNdjson } from "@/app/lib/search-stream";
import { addDays } from "@/lib/dates";
import type { FlightProvider, Offer, OfferQuery } from "@/lib/providers/types";
import { SEARCH_STREAM_TYPE } from "@/lib/search-events";
import type { SearchEvent } from "@/lib/search-events";
import type { SearchRequest } from "@/lib/search-request";
import { TtlCache } from "@/lib/server/cache";
import type { SearchConfig } from "@/lib/server/config";
import { runSearch } from "@/lib/server/search";
import type { SearchDeps } from "@/lib/server/search";
import { SEARCH_FAILED, searchEventStream } from "@/lib/server/search-stream";

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
  concurrency: 1,
  callTimeoutMs: 1000,
  retries: 0,
  backoffMs: 0,
  maxProviderCalls: 1000,
  cacheTtlMs: 60_000,
  maxDatesPerLeg: 2,
  maxAirportsPerCountry: 3,
  verifyTop: 0,
};

class StubProvider implements FlightProvider {
  readonly name = "stub";
  calls = 0;
  async searchOffers(q: OfferQuery): Promise<Offer[]> {
    this.calls++;
    const price = 50 + (q.origin + q.destination).charCodeAt(3);
    return [{ origin: q.origin, destination: q.destination, date: q.date, price, currency: q.currency, carriers: ["ST"] }];
  }
}

function deps(provider: FlightProvider, extra: Partial<SearchDeps> = {}): SearchDeps {
  return { provider, requested: provider.name, fellBack: false, cache: new TtlCache<Offer[]>(60_000), config, sleep: async () => {}, ...extra };
}

async function events(stream: ReadableStream<Uint8Array>): Promise<SearchEvent[]> {
  const out: SearchEvent[] = [];
  await readNdjson(stream, (line) => out.push(line as SearchEvent));
  return out;
}

const progressOf = (all: SearchEvent[]) => all.flatMap((e) => (e.type === "progress" ? [e] : []));

describe("searchEventStream", () => {
  it("reports every settled lookup per phase, then the same result as a plain search", async () => {
    const plainProvider = new StubProvider();
    const plain = await runSearch(request, deps(plainProvider));
    const provider = new StubProvider();
    const all = await events(searchEventStream((onProgress) => runSearch(request, deps(provider, { onProgress, progressIntervalMs: 0 }))));

    const progress = progressOf(all);
    const out = progress.filter((e) => e.phase === "out");
    const back = progress.filter((e) => e.phase === "in");
    expect(out.length).toBeGreaterThan(0);
    expect(back.length).toBeGreaterThan(0);
    // Phases arrive in order, each counting up to its own total, and only the last event is the result.
    expect(progress.map((e) => e.phase)).toEqual([...out.map(() => "out"), ...back.map(() => "in")]);
    expect(out.map((e) => e.done)).toEqual(out.map((_, i) => i + 1));
    expect(back.map((e) => e.done)).toEqual(back.map((_, i) => i + 1));
    expect(new Set(out.map((e) => e.total))).toEqual(new Set([out.length]));
    expect(all.map((e) => e.type)).toEqual([...progress.map(() => "progress"), "result"]);

    // Outbound lookups light up airports before any trip exists; trips appear while returns come in.
    expect(out.every((e) => e.results.combinations.length === 0)).toBe(true);
    const pricedOut = out.map((e) => e.results.airports.filter((a) => a.cheapestOut !== undefined).length);
    expect(pricedOut).toEqual([...pricedOut].sort((a, b) => a - b));
    expect(pricedOut.at(-1)).toBeGreaterThan(0);
    expect(back.findIndex((e) => e.results.combinations.length > 0)).toBeLessThan(back.length - 1);

    const last = all.at(-1);
    expect(last?.type === "result" ? last.response : null).toEqual(plain);
    expect(back.at(-1)?.results.combinations).toEqual(plain.combinations);
    expect(provider.calls).toBe(plainProvider.calls);
  });

  it("spaces reports out, but always sends the last lookup of each phase", async () => {
    const provider = new StubProvider();
    const all = await events(searchEventStream((onProgress) => runSearch(request, deps(provider, { onProgress, progressIntervalMs: 60_000 }))));
    const progress = progressOf(all);
    expect(progress.map((e) => [e.phase, e.done === e.total])).toEqual([
      ["out", false],
      ["out", true],
      ["in", false],
      ["in", true],
    ]);
    expect(all.at(-1)?.type).toBe("result");
  });

  it("ends with a generic error event when the search throws", async () => {
    const all = await events(searchEventStream(() => Promise.reject(new Error("secret provider detail"))));
    expect(all).toEqual([{ type: "error", errors: [SEARCH_FAILED] }]);
  });
});

describe("readNdjson", () => {
  it("joins lines split across chunks", async () => {
    const encoder = new TextEncoder();
    const chunks = ['{"a":1}\n{"b"', ':2}\n\n{"c":3}'];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    });
    const lines: unknown[] = [];
    await readNdjson(body, (line) => lines.push(line));
    expect(lines).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });
});

describe("/api/search streaming", () => {
  afterEach(() => vi.unstubAllEnvs());
  const today = new Date().toISOString().slice(0, 10);
  const url = `http://test/api/search?origin=LHR&country=IT&earliest=${addDays(today, 30)}&latest=${addDays(today, 34)}&minNights=5&maxNights=7`;

  it("streams NDJSON when asked and plain JSON otherwise", async () => {
    vi.stubEnv("FLIGHT_PROVIDER", "mock");
    vi.stubEnv("MAX_PROVIDER_CALLS", "200");
    const streamed = await GET(new Request(url, { headers: { Accept: SEARCH_STREAM_TYPE } }));
    expect(streamed.headers.get("content-type")).toContain(SEARCH_STREAM_TYPE);
    if (!streamed.body) throw new Error("no body");
    const all = await events(streamed.body);
    const last = all.at(-1);
    expect(last?.type).toBe("result");
    expect(all.slice(0, -1).every((e) => e.type === "progress")).toBe(true);

    const plain = await GET(new Request(url));
    expect(plain.headers.get("content-type")).toContain("application/json");
    const body = await plain.json();
    expect(last?.type === "result" ? last.response.combinations : null).toEqual(body.combinations);
  });
});
