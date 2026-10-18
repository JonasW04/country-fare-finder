import { MockProvider } from "../providers/mock";
import { RyanairProvider } from "../providers/ryanair";
import type { FlightProvider } from "../providers/types";
import type { ProviderDefaults } from "./config";

export interface ProviderSelection {
  provider: FlightProvider;
  requested: "mock" | "ryanair";
  /** True when a keyed provider was requested but its credentials were missing, so mock data is served. */
  fellBack: boolean;
  credentialsPresent: boolean;
  /** Used when the matching env variables are not set. */
  defaults?: ProviderDefaults;
}

type Env = Record<string, string | undefined>;

export function readProviderSelection(env: Env = process.env): ProviderSelection {
  const requested = env.FLIGHT_PROVIDER?.trim().toLowerCase() === "ryanair" ? "ryanair" : "mock";

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
  return { provider: new MockProvider(), requested, fellBack: false, credentialsPresent: false };
}

// One provider instance per process so provider-side caches are reused between searches.
let cached: ProviderSelection | null = null;

export function getProviderSelection(): ProviderSelection {
  cached ??= readProviderSelection();
  return cached;
}
