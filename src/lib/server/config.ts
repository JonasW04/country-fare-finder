export interface SearchConfig {
  concurrency: number;
  callTimeoutMs: number;
  retries: number;
  backoffMs: number;
  maxProviderCalls: number;
  cacheTtlMs: number;
  maxDatesPerLeg: number;
  /** Undefined means every airport of the country is priced. */
  maxAirportsPerCountry?: number;
  /**
   * How many top combinations with a fare-calendar estimate leg get an exact re-check. Only
   * per-day range providers produce estimates, so other providers ignore it.
   */
  verifyTop: number;
}

/** What a provider wants when the matching env variable is not set. */
export interface ProviderDefaults {
  concurrency?: number;
  maxProviderCalls?: number;
  maxDatesPerLeg?: number;
  maxAirportsPerCountry?: number;
  verifyTop?: number;
}

type Env = Record<string, string | undefined>;

function intFromEnv(env: Env, name: string, fallback: number, min = 1): number {
  const parsed = Number.parseInt(env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

function optionalIntFromEnv(env: Env, name: string, fallback: number | undefined): number | undefined {
  const parsed = Number.parseInt(env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

export function loadSearchConfig(env: Env = process.env, defaults: ProviderDefaults = {}): SearchConfig {
  return {
    concurrency: intFromEnv(env, "SEARCH_CONCURRENCY", defaults.concurrency ?? 4),
    callTimeoutMs: intFromEnv(env, "PROVIDER_TIMEOUT_MS", 10_000),
    retries: intFromEnv(env, "PROVIDER_RETRIES", 2, 0),
    backoffMs: intFromEnv(env, "PROVIDER_BACKOFF_MS", 400, 0),
    maxProviderCalls: intFromEnv(env, "MAX_PROVIDER_CALLS", defaults.maxProviderCalls ?? 60),
    cacheTtlMs: intFromEnv(env, "CACHE_TTL_SECONDS", 20 * 60) * 1000,
    maxDatesPerLeg: intFromEnv(env, "MAX_DATES_PER_LEG", defaults.maxDatesPerLeg ?? 3),
    maxAirportsPerCountry: optionalIntFromEnv(env, "MAX_AIRPORTS_PER_COUNTRY", defaults.maxAirportsPerCountry),
    verifyTop: intFromEnv(env, "VERIFY_TOP", defaults.verifyTop ?? 0, 0),
  };
}
