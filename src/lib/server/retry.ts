import { ProviderError } from "../providers/types";

export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
  /** Called before every attempt; returning false stops retrying (for example, budget exhausted). */
  beforeAttempt?: () => boolean;
}

export class AttemptsExhaustedError extends Error {
  constructor() {
    super("Provider call budget exhausted");
    this.name = "AttemptsExhaustedError";
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function isRetryable(err: unknown): boolean {
  if (!(err instanceof ProviderError) || err.status === undefined) return false;
  // A search-stopping error (spend limit, rejected key) cannot succeed on retry whatever its status.
  if (err.stopsSearch) return false;
  return err.status === 429 || err.status >= 500;
}

/** Exponential backoff on 429/5xx only; other failures are permanent and surface immediately. */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    if (options.beforeAttempt && !options.beforeAttempt()) throw new AttemptsExhaustedError();
    try {
      return await fn();
    } catch (err) {
      if (attempt >= options.retries || !isRetryable(err)) throw err;
      await sleep(options.baseDelayMs * 2 ** attempt);
    }
  }
}
