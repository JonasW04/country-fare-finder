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

// Countries with hundreds of airports would otherwise plan thousands of mock lookups.
const MOCK_DEFAULTS: ProviderDefaults = { maxAirportsPerCountry: 15 };

export function readProviderSelection(env: Env = process.env): ProviderSelection {
  const choice = env.FLIGHT_PROVIDER?.trim().toLowerCase();
  const requested = choice === "ryanair" || choice === "ignav" ? choice : "mock";
  const apiKey = env.IGNAV_API_KEY?.trim() ?? "";

  if (requested === "ignav") {
    if (!apiKey) {
      return { provider: new MockProvider(), requested, fellBack: true, credentialsPresent: false, defaults: MOCK_DEFAULTS };
    }
    return {
      provider: new IgnavProvider({ apiKey }),
      requested,
      fellBack: false,
      credentialsPresent: true,
      // One fare-calendar request covers an airport's whole window, so 12 airports cost about 24
      // calendar requests plus up to 10 exact re-checks of the top 5 combinations.
      defaults: { maxAirportsPerCountry: 12, verifyTop: 5 },
    };
  }

  if (requested === "ryanair") {
    // Keyless, so there is no credential to be missing and no fallback to mock.
    return {
      provider: new RyanairProvider(),
      requested,
      fellBack: false,
      credentialsPresent: false,
      // Chunked return windows for every city with an outbound fare need more than the global 60.
      defaults: { concurrency: RyanairProvider.defaultConcurrency, maxProviderCalls: 90 },
    };
  }
  return {
    provider: new MockProvider(),
    requested,
    fellBack: false,
    credentialsPresent: Boolean(apiKey),
    defaults: MOCK_DEFAULTS,
  };
}

// One provider instance per process so provider-side caches are reused between searches.
let cached: ProviderSelection | null = null;

export function getProviderSelection(): ProviderSelection {
  cached ??= readProviderSelection();
  return cached;
}
