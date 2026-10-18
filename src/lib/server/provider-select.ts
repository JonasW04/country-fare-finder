import { AmadeusProvider } from "../providers/amadeus";
import { MockProvider } from "../providers/mock";
import type { FlightProvider } from "../providers/types";

export interface ProviderSelection {
  provider: FlightProvider;
  requested: "mock" | "amadeus";
  /** True when amadeus was requested but credentials were missing, so mock data is served. */
  fellBack: boolean;
  credentialsPresent: boolean;
}

type Env = Record<string, string | undefined>;

export function readProviderSelection(env: Env = process.env): ProviderSelection {
  const requested = env.FLIGHT_PROVIDER?.trim().toLowerCase() === "amadeus" ? "amadeus" : "mock";
  const clientId = env.AMADEUS_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.AMADEUS_CLIENT_SECRET?.trim() ?? "";
  const credentialsPresent = Boolean(clientId && clientSecret);

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
