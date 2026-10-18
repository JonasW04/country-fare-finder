import { ProviderError } from "./types";
import type { FlightProvider, Offer, OfferQuery, SearchOptions } from "./types";

export const DEFAULT_AMADEUS_BASE_URL = "https://test.api.amadeus.com";

// Credentials are injected by src/lib/server; this file never reads process.env.
export interface AmadeusConfig {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  /** Offers kept per call; the cheapest few are enough for ranking. */
  maxOffers?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface AmadeusOffer {
  price?: { grandTotal?: string; total?: string; currency?: string };
  validatingAirlineCodes?: string[];
  itineraries?: { segments?: { carrierCode?: string }[] }[];
}

/** Removes credential values from any text before it can reach logs or error messages. */
export function maskSecrets(text: string, secrets: string[]): string {
  return secrets.reduce((acc, s) => (s ? acc.split(s).join("***") : acc), text);
}

export class AmadeusProvider implements FlightProvider {
  readonly name = "amadeus";
  private token: { value: string; expiresAt: number } | null = null;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly config: AmadeusConfig) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_AMADEUS_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.now = config.now ?? Date.now;
  }

  async searchOffers(query: OfferQuery, options: SearchOptions = {}): Promise<Offer[]> {
    const token = await this.getToken(options.signal);
    const params = new URLSearchParams({
      originLocationCode: query.origin,
      destinationLocationCode: query.destination,
      departureDate: query.date,
      adults: String(query.adults),
      travelClass: query.cabin.toUpperCase(),
      currencyCode: query.currency,
      max: String(this.config.maxOffers ?? 5),
    });
    const res = await this.fetchImpl(`${this.baseUrl}/v2/shopping/flight-offers?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: options.signal,
    });
    if (res.status === 401) this.token = null;
    if (!res.ok) throw this.failure("Flight offers request", res.status);

    const body = (await res.json()) as { data?: AmadeusOffer[] };
    return (body.data ?? []).flatMap((o) => this.toOffer(o, query));
  }

  private toOffer(o: AmadeusOffer, query: OfferQuery): Offer[] {
    const price = Number(o.price?.grandTotal ?? o.price?.total);
    if (!Number.isFinite(price)) return [];
    const segmentCarriers = (o.itineraries?.[0]?.segments ?? []).map((s) => s.carrierCode ?? "");
    const carriers = [...new Set([...(o.validatingAirlineCodes ?? []), ...segmentCarriers])].filter(Boolean);
    return [
      {
        origin: query.origin,
        destination: query.destination,
        date: query.date,
        price,
        currency: o.price?.currency ?? query.currency,
        carriers,
      },
    ];
  }

  private async getToken(signal?: AbortSignal): Promise<string> {
    if (this.token && this.token.expiresAt > this.now()) return this.token.value;

    const res = await this.fetchImpl(`${this.baseUrl}/v1/security/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
      signal,
    });
    if (!res.ok) throw this.failure("OAuth token request", res.status);

    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw this.failure("OAuth token response missing access_token", res.status);
    // Refresh a little early so a token never expires mid-request.
    const ttlMs = Math.max(0, (body.expires_in ?? 1799) - 30) * 1000;
    this.token = { value: body.access_token, expiresAt: this.now() + ttlMs };
    return this.token.value;
  }

  /** Status-only messages: response bodies are never echoed, so nothing sensitive can leak. */
  private failure(what: string, status: number): ProviderError {
    const message = maskSecrets(`Amadeus ${what} failed with HTTP ${status}`, [
      this.config.clientId,
      this.config.clientSecret,
    ]);
    return new ProviderError(message, status);
  }
}
