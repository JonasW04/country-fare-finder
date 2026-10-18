import { findAirport } from "../airports";
import { maskSecrets } from "./mask";
import { ProviderError } from "./types";
import type { FlightProvider, Offer, OfferQuery, SearchOptions } from "./types";

export const IGNAV_ONE_WAY_URL = "https://ignav.com/api/fares/one-way";

// Ignav sets the response currency from the market, so a request currency maps to the market that prices in it.
const MARKET_BY_CURRENCY: Record<string, string> = {
  EUR: "DE",
  NOK: "NO",
  SEK: "SE",
  DKK: "DK",
  GBP: "GB",
  USD: "US",
  CHF: "CH",
  PLN: "PL",
};

const CABINS = new Set(["economy", "premium_economy", "business", "first"]);

export const marketForCurrency = (currency: string): string => MARKET_BY_CURRENCY[currency.toUpperCase()] ?? "US";

export interface IgnavConfig {
  /** Injected by src/lib/server; this file never reads process.env. */
  apiKey: string;
  fetchImpl?: typeof fetch;
}

interface Itinerary {
  price: number;
  currency: string;
  carriers: string[];
  requiresSelfTransfer: boolean;
  /** The airports the traveller really leaves from and lands at, which differ from a metro query code. */
  departureAirport?: string;
  arrivalAirport?: string;
}

// Only metro codes Ignav is known to accept. OurAirports-style groupings such as BKK are not official
// IATA metro codes, so they stay out of this list.
const QUERYABLE_METROS = new Set(["ROM", "MIL", "PAR"]);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const mismatch = (what: string): ProviderError =>
  new ProviderError(`Ignav response did not match the expected shape (${what}); the API may have changed.`);

function parseItineraries(body: unknown): Itinerary[] {
  if (!isRecord(body) || !Array.isArray(body.itineraries)) throw mismatch("missing itineraries array");
  return body.itineraries.map((raw: unknown) => {
    const price = isRecord(raw) ? raw.price : undefined;
    const outbound = isRecord(raw) ? raw.outbound : undefined;
    const amount = isRecord(price) ? price.amount : undefined;
    const currency = isRecord(price) ? price.currency : undefined;
    const segments = isRecord(outbound) ? outbound.segments : undefined;
    if (typeof amount !== "number" || !Number.isFinite(amount) || typeof currency !== "string") throw mismatch("price");
    if (!Array.isArray(segments)) throw mismatch("outbound segments");
    const carriers = segments.flatMap((s: unknown) => {
      const code = isRecord(s) ? s.marketing_carrier_code : undefined;
      return typeof code === "string" && code ? [code] : [];
    });
    const airportAt = (segment: unknown, field: string): string | undefined => {
      const code = isRecord(segment) ? segment[field] : undefined;
      return typeof code === "string" && code ? code.toUpperCase() : undefined;
    };
    return {
      price: amount,
      currency,
      departureAirport: airportAt(segments[0], "departure_airport"),
      arrivalAirport: airportAt(segments[segments.length - 1], "arrival_airport"),
      carriers: [...new Set(carriers)],
      requiresSelfTransfer: isRecord(raw) && raw.requires_self_transfer === true,
    };
  });
}

/** Only the machine-readable error code is ever surfaced, never the free-text message or the body. */
async function errorCode(res: Response): Promise<string | undefined> {
  try {
    const body: unknown = await res.json();
    const code = isRecord(body) && isRecord(body.error) ? body.error.code : undefined;
    return typeof code === "string" && /^[a-z0-9_]{1,40}$/.test(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

export class IgnavProvider implements FlightProvider {
  readonly name = "ignav";
  readonly meteredRequests = true;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: IgnavConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  /** One call to ROM, MIL or PAR covers every airport of that metro, so a metro costs a single slot. */
  cityQueryCode(iata: string): string {
    const metro = findAirport(iata)?.metro;
    return metro && QUERYABLE_METROS.has(metro) ? metro : iata;
  }

  async searchOffers(query: OfferQuery, options: SearchOptions = {}): Promise<Offer[]> {
    const cabin = query.cabin.toLowerCase();
    const body = {
      origin: query.origin,
      destination: query.destination,
      departure_date: query.date,
      adults: query.adults,
      ...(CABINS.has(cabin) ? { cabin_class: cabin } : {}),
      market: marketForCurrency(query.currency),
    };

    // Counted here so every real request, retries included, spends the search budget.
    options.onRequest?.();
    let res: Response;
    try {
      res = await this.fetchImpl(IGNAV_ONE_WAY_URL, {
        method: "POST",
        headers: { "X-Api-Key": this.config.apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: options.signal,
      });
    } catch (err) {
      if (options.signal?.aborted) throw err;
      throw this.failure(`Ignav request failed (${err instanceof Error ? err.name : "network error"})`, 503);
    }
    if (!res.ok) throw await this.httpFailure(res);

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw mismatch("body is not JSON");
    }
    // A metro query can land at any airport of the metro. Only itineraries ending at a known airport of
    // that metro are usable, so an unexpected airport can never be mislabelled as another one.
    const origin = (it: Itinerary) => (QUERYABLE_METROS.has(query.origin) ? it.departureAirport : query.origin);
    const destination = (it: Itinerary) => (QUERYABLE_METROS.has(query.destination) ? it.arrivalAirport : query.destination);
    const inMetro = (iata: string | undefined, code: string) =>
      !QUERYABLE_METROS.has(code) || (iata !== undefined && findAirport(iata)?.metro === code);
    const cheapest = parseItineraries(json)
      .filter((it) => inMetro(origin(it), query.origin) && inMetro(destination(it), query.destination))
      .reduce<Itinerary | undefined>((best, it) => (!best || it.price < best.price ? it : best), undefined);
    const from = cheapest && origin(cheapest);
    const to = cheapest && destination(cheapest);
    if (!cheapest || !from || !to) return [];
    return [
      {
        origin: from,
        destination: to,
        date: query.date,
        price: cheapest.price,
        currency: cheapest.currency,
        carriers: cheapest.carriers,
        ...(cheapest.requiresSelfTransfer ? { requiresSelfTransfer: true } : {}),
      },
    ];
  }

  private async httpFailure(res: Response): Promise<ProviderError> {
    const code = await errorCode(res);
    switch (res.status) {
      case 402:
        return this.failure("Ignav free quota (1000 requests/month) is used up.", 402, true);
      case 401:
        return this.failure("Ignav rejected the API key (HTTP 401); check IGNAV_API_KEY.", 401, true);
      case 403:
        return this.failure(
          code === "email_not_verified"
            ? "Ignav account email is not verified (HTTP 403)."
            : "Ignav refused the request (HTTP 403).",
          403,
          true,
        );
      default:
        return this.failure(`Ignav request failed with HTTP ${res.status}${code ? ` (${code})` : ""}`, res.status);
    }
  }

  private failure(message: string, status: number, stopsSearch = false): ProviderError {
    return new ProviderError(maskSecrets(message, [this.config.apiKey]), status, stopsSearch);
  }
}
