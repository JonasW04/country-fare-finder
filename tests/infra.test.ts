import { describe, expect, it } from "vitest";
import { CallBudget } from "@/lib/server/budget";
import { TtlCache } from "@/lib/server/cache";
import { runBounded } from "@/lib/server/pool";
import { AttemptsExhaustedError, withRetry } from "@/lib/server/retry";
import { ProviderError } from "@/lib/providers/types";
import { maskSecrets } from "@/lib/providers/mask";

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

describe("maskSecrets", () => {
  it("replaces every occurrence", () => {
    expect(maskSecrets("a SECRET b SECRET", ["SECRET", ""])).toBe("a *** b ***");
  });
});
