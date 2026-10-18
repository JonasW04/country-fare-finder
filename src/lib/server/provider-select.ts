import { IgnavProvider } from "../providers/ignav";
import { MockProvider } from "../providers/mock";
import { RyanairProvider } from "../providers/ryanair";
import type { FlightProvider } from "../providers/types";
import type { ProviderDefaults } from "./config";

export interface ProviderSelection {
  provider: FlightProvider;
  requested: "mock" | "ryanair" | "ignav";
  /** True when a keyed provider was requested but its credentials were missing, so mock data is served. */
  fellBack: boolean;
  credentialsPresent: boolean;
  /** Used when the matching env variables are not set. */
  defaults?: ProviderDefaults;
}

type Env = Record<string, string | undefined>;

export function readProviderSelection(env: Env = process.env): ProviderSelection {
  const choice = env.FLIGHT_PROVIDER?.trim().toLowerCase();
  const requested = choice === "ryanair" || choice === "ignav" ? choice : "mock";
  const apiKey = env.IGNAV_API_KEY?.trim() ?? "";

  if (requested === "ignav") {
    if (!apiKey) return { provider: new MockProvider(), requested, fellBack: true, credentialsPresent: false };
    return {
      provider: new IgnavProvider({ apiKey }),
      requested,
      fellBack: false,
      credentialsPresent: true,
      // The free tier allows 1000 requests a month, so a default search stays near 24 requests.
      defaults: { maxDatesPerLeg: 2, maxAirportsPerCountry: 6 },
    };
  }

  if (requested === "ryanair") {
    // Keyless, so there is no credential to be missing and no fallback to mock.
    return {
      provider: new RyanairProvider(),
      requested,
      fellBack: false,
      credentialsPresent: false,
      defaults: { concurrency: RyanairProvider.defaultConcurrency },
    };
  }
  return { provider: new MockProvider(), requested, fellBack: false, credentialsPresent: Boolean(apiKey) };
}

// One provider instance per process so provider-side caches are reused between searches.
let cached: ProviderSelection | null = null;

export function getProviderSelection(): ProviderSelection {
  cached ??= readProviderSelection();
  return cached;
}
