import { ProviderError } from "../providers/types";
import type { FlightProvider, Offer, OfferQuery } from "../providers/types";
import type { CallBudget } from "./budget";
import type { TtlCache } from "./cache";
import type { SearchConfig } from "./config";
import type { Lookup } from "./plan";
import { runBounded } from "./pool";
import { AttemptsExhaustedError, withRetry } from "./retry";

export interface RunnerDeps {
  provider: FlightProvider;
  cache: TtlCache<Offer[]>;
  config: SearchConfig;
  sleep?: (ms: number) => Promise<void>;
}

/** What one phase lost: budget skips, halted skips and failures, each with its own consequence. */
export interface PhaseTally {
  skipped: number;
  haltedSkipped: number;
  failed: number;
  failureNotes: Set<string>;
}

function cacheKey(provider: string, q: OfferQuery): string {
  // Adults and currency change the price, so they belong in the key alongside the spec's fields.
  return [provider, q.origin, q.destination, q.date, q.dateTo ?? "", q.cabin, q.adults, q.currency].join("|");
}

async function callProvider(deps: RunnerDeps, query: OfferQuery, budget: CallBudget, onNote: (message: string) => void): Promise<Offer[]> {
  const { config, provider } = deps;
  return withRetry(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.callTimeoutMs);
      try {
        return await provider.searchOffers(query, {
          signal: controller.signal,
          onNote,
          // Metered providers spend the budget themselves, once per real HTTP request.
          onRequest: provider.meteredRequests
            ? () => {
                if (!budget.tryConsume()) throw new AttemptsExhaustedError();
              }
            : undefined,
        });
      } catch (err) {
        // A timeout is transient, so give it the same treatment as a 5xx.
        if (controller.signal.aborted) throw new ProviderError("Provider call timed out", 504);
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
    {
      retries: config.retries,
      baseDelayMs: config.backoffMs,
      sleep: deps.sleep,
      beforeAttempt: provider.meteredRequests ? undefined : () => budget.tryConsume(),
    },
  );
}

/**
 * Runs lookups phase by phase against one budget and cache. Halting is shared across phases:
 * once the provider says no further request can succeed, later phases stop too.
 */
export class LookupRunner {
  cacheHits = 0;
  cacheMisses = 0;
  /** Set by a provider error that makes every further request pointless (quota gone, key rejected). */
  haltReason: string | null = null;
  readonly emptyResultNotes = new Set<string>();

  constructor(
    private readonly deps: RunnerDeps,
    private readonly budget: CallBudget,
  ) {}

  /** `onSettled` runs once per lookup after it has been answered, skipped or failed. */
  async run(lookups: Lookup[], onOffers: (lookup: Lookup, offers: Offer[]) => void, onSettled?: () => void): Promise<PhaseTally> {
    const tally: PhaseTally = { skipped: 0, haltedSkipped: 0, failed: 0, failureNotes: new Set() };
    const settle = async (lookup: Lookup) => {
      const key = cacheKey(this.deps.provider.name, lookup.query);
      let offers = this.deps.cache.get(key);
      if (offers) {
        this.cacheHits++;
      } else {
        this.cacheMisses++;
        if (this.haltReason) {
          tally.haltedSkipped++;
          return;
        }
        try {
          offers = await callProvider(this.deps, lookup.query, this.budget, (m) => this.emptyResultNotes.add(m));
          this.deps.cache.set(key, offers);
        } catch (err) {
          if (err instanceof AttemptsExhaustedError) tally.skipped++;
          else if (err instanceof ProviderError && err.stopsSearch) {
            this.haltReason ??= err.message;
            tally.haltedSkipped++;
          } else {
            tally.failed++;
            tally.failureNotes.add(err instanceof Error ? err.message : "Provider call failed");
          }
          return;
        }
      }
      onOffers(lookup, offers);
    };
    const tasks = lookups.map((lookup) => async () => {
      await settle(lookup);
      onSettled?.();
    });
    await runBounded(tasks, this.deps.config.concurrency);
    return tally;
  }
}
