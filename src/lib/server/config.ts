export interface SearchConfig {
  concurrency: number;
  callTimeoutMs: number;
  retries: number;
  backoffMs: number;
  maxProviderCalls: number;
  cacheTtlMs: number;
  maxDatesPerLeg: number;
}

type Env = Record<string, string | undefined>;

function intFromEnv(env: Env, name: string, fallback: number, min = 1): number {
  const parsed = Number.parseInt(env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

export function loadSearchConfig(env: Env = process.env, defaultConcurrency = 4): SearchConfig {
  return {
    concurrency: intFromEnv(env, "SEARCH_CONCURRENCY", defaultConcurrency),
    callTimeoutMs: intFromEnv(env, "PROVIDER_TIMEOUT_MS", 10_000),
    retries: intFromEnv(env, "PROVIDER_RETRIES", 2, 0),
    backoffMs: intFromEnv(env, "PROVIDER_BACKOFF_MS", 400, 0),
    maxProviderCalls: intFromEnv(env, "MAX_PROVIDER_CALLS", 60),
    cacheTtlMs: intFromEnv(env, "CACHE_TTL_SECONDS", 20 * 60) * 1000,
    maxDatesPerLeg: intFromEnv(env, "MAX_DATES_PER_LEG", 3),
  };
}
