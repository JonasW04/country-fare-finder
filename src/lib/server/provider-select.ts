import { AmadeusProvider } from "../providers/amadeus";
import { MockProvider } from "../providers/mock";
import { RyanairProvider } from "../providers/ryanair";
import type { FlightProvider } from "../providers/types";

export interface ProviderSelection {
  provider: FlightProvider;
  requested: "mock" | "amadeus" | "ryanair";
  /** True when amadeus was requested but credentials were missing, so mock data is served. */
  fellBack: boolean;
  credentialsPresent: boolean;
  /** Used for the search pool when SEARCH_CONCURRENCY is not set. */
  defaultConcurrency?: number;
}

type Env = Record<string, string | undefined>;

export function readProviderSelection(env: Env = process.env): ProviderSelection {
  const choice = env.FLIGHT_PROVIDER?.trim().toLowerCase();
  const requested = choice === "amadeus" || choice === "ryanair" ? choice : "mock";
  const clientId = env.AMADEUS_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.AMADEUS_CLIENT_SECRET?.trim() ?? "";
  const credentialsPresent = Boolean(clientId && clientSecret);

  if (requested === "ryanair") {
    // Keyless, so there is no credential to be missing and no fallback to mock.
    return {
      provider: new RyanairProvider(),
      requested,
      fellBack: false,
      credentialsPresent: false,
      defaultConcurrency: RyanairProvider.defaultConcurrency,
    };
  }
  if (requested === "amadeus" && credentialsPresent) {
    const baseUrl = env.AMADEUS_BASE_URL?.trim() || undefined;
    return { provider: new AmadeusProvider({ clientId, clientSecret, baseUrl }), requested, fellBack: false, credentialsPresent };
  }
  return { provider: new MockProvider(), requested, fellBack: requested === "amadeus", credentialsPresent };
}

// One provider instance per process so the Amadeus OAuth token is reused between searches.
let cached: ProviderSelection | null = null;

export function getProviderSelection(): ProviderSelection {
  cached ??= readProviderSelection();
  return cached;
}
