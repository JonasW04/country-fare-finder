import { describe, expect, it } from "vitest";
import { CallBudget } from "@/lib/server/budget";
import { TtlCache } from "@/lib/server/cache";
import { runBounded } from "@/lib/server/pool";
import { AttemptsExhaustedError, withRetry } from "@/lib/server/retry";
import { ProviderError } from "@/lib/providers/types";
import { AmadeusProvider, maskSecrets } from "@/lib/providers/amadeus";

describe("TtlCache", () => {
  it("expires entries and counts hits and misses", () => {
    let now = 0;
    const cache = new TtlCache<number>(1000, 10, () => now);
    expect(cache.get("a")).toBeUndefined();
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
    now = 1000;
    expect(cache.get("a")).toBeUndefined();
    expect(cache.stats()).toEqual({ hits: 1, misses: 2, size: 0 });
  });

  it("evicts the oldest entry beyond its size bound", () => {
    const cache = new TtlCache<number>(1000, 2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
  });
});

describe("CallBudget", () => {
  it("refuses calls past the cap and remembers that it did", () => {
    const budget = new CallBudget(2);
    expect([budget.tryConsume(), budget.tryConsume(), budget.tryConsume()]).toEqual([true, true, false]);
    expect(budget.calls).toBe(2);
    expect(budget.exhausted).toBe(true);
  });

  it("is not exhausted when the cap is exactly met", () => {
    const budget = new CallBudget(1);
    budget.tryConsume();
    expect(budget.exhausted).toBe(false);
  });
});

describe("runBounded", () => {
  it("never exceeds the concurrency limit and keeps result order", async () => {
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 10 }, (_, i) => async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
      return i;
    });
    expect(await runBounded(tasks, 3)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(peak).toBe(3);
  });
});

describe("withRetry", () => {
  const fail = (status: number) => new ProviderError("x", status);

  it("retries 429 and 5xx with exponential backoff", async () => {
    const delays: number[] = [];
    let calls = 0;
    const result = await withRetry(
      async () => {
        if (++calls < 3) throw fail(calls === 1 ? 429 : 503);
        return "ok";
      },
      { retries: 3, baseDelayMs: 100, sleep: async (ms) => void delays.push(ms) },
    );
    expect(result).toBe("ok");
    expect(delays).toEqual([100, 200]);
  });

  it("does not retry other errors", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw fail(400); }, { retries: 3, baseDelayMs: 1, sleep: async () => {} }),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it("gives up after the retry limit", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw fail(500); }, { retries: 2, baseDelayMs: 1, sleep: async () => {} }),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toBe(3);
  });

  it("stops when the budget refuses an attempt", async () => {
    const budget = new CallBudget(2);
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw fail(500); }, {
        retries: 5,
        baseDelayMs: 1,
        sleep: async () => {},
        beforeAttempt: () => budget.tryConsume(),
      }),
    ).rejects.toBeInstanceOf(AttemptsExhaustedError);
    expect(calls).toBe(2);
  });
});

describe("AmadeusProvider", () => {
  const secret = "s3cr3t-value";
  const clientId = "client-id-value";
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it("fetches a token once, then maps offers", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      urls.push(String(url));
      if (String(url).includes("oauth2/token")) return json({ access_token: "tok", expires_in: 1799 });
      return json({
        data: [
          { price: { grandTotal: "123.45", currency: "EUR" }, validatingAirlineCodes: ["IB"], itineraries: [{ segments: [{ carrierCode: "IB" }, { carrierCode: "VY" }] }] },
          { price: {} },
        ],
      });
    }) as typeof fetch;
    const provider = new AmadeusProvider({ clientId, clientSecret: secret, fetchImpl });
    const q = { origin: "MAD", destination: "FCO", date: "2027-03-01", cabin: "economy", adults: 1, currency: "EUR" };

    const offers = await provider.searchOffers(q);
    await provider.searchOffers(q);

    expect(offers).toEqual([
      { origin: "MAD", destination: "FCO", date: "2027-03-01", price: 123.45, currency: "EUR", carriers: ["IB", "VY"] },
    ]);
    expect(urls.filter((u) => u.includes("oauth2/token"))).toHaveLength(1);
    expect(urls[0]).toContain("https://test.api.amadeus.com");
    expect(urls.find((u) => u.includes("flight-offers"))).toContain("travelClass=ECONOMY");
  });

  it("surfaces status-only errors with no credential values", async () => {
    const fetchImpl = (async () => json({ error: `bad ${secret} ${clientId}` }, 401)) as typeof fetch;
    const provider = new AmadeusProvider({ clientId, clientSecret: secret, fetchImpl });
    const err = await provider
      .searchOffers({ origin: "MAD", destination: "FCO", date: "2027-03-01", cabin: "ECONOMY", adults: 1, currency: "EUR" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    const message = (err as ProviderError).message;
    expect(message).toContain("401");
    expect(message).not.toContain(secret);
    expect(message).not.toContain(clientId);
  });

  it("maskSecrets replaces every occurrence", () => {
    expect(maskSecrets("a SECRET b SECRET", ["SECRET", ""])).toBe("a *** b ***");
  });
});
