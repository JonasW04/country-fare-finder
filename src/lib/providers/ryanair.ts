import { findAirport } from "../airports";
import { TtlCache } from "../server/cache";
import { ProviderError } from "./types";
import type { FlightProvider, Offer, OfferQuery, SearchOptions } from "./types";

export const RYANAIR_FARES_URL = "https://services-api.ryanair.com/farfnd/v4/oneWayFares";

// The endpoint rejects some default agent strings, so present as an ordinary desktop browser.
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface RyanairConfig {
  fetchImpl?: typeof fetch;
  /** How long a country-wide response is shared between airport lookups. */
  cacheTtlMs?: number;
  now?: () => number;
}

interface FareLeg {
  origin: string;
  destination: string;
  date: string;
  price: number;
  currency: string;
}

const mismatch = (what: string): ProviderError =>
  new ProviderError(
    `Ryanair fare response did not match the expected shape (${what}); the undocumented endpoint may have changed.`,
  );

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function iataOf(airport: unknown, what: string): string {
  const code = isRecord(airport) ? airport.iataCode : undefined;
  if (typeof code !== "string" || code.length === 0) throw mismatch(what);
  return code.toUpperCase();
}

/** Validates by hand so a changed payload becomes a clear limitation instead of a crash or a bad fare. */
export function parseFares(body: unknown): FareLeg[] {
  if (!isRecord(body) || !Array.isArray(body.fares)) throw mismatch("missing fares array");
  return body.fares.map((fare: unknown) => {
    const outbound = isRecord(fare) ? fare.outbound : undefined;
    if (!isRecord(outbound)) throw mismatch("fare without outbound leg");
    const price = outbound.price;
    const value = isRecord(price) ? price.value : undefined;
    const currency = isRecord(price) ? price.currencyCode : undefined;
    const departure = outbound.departureDate;
    if (typeof value !== "number" || !Number.isFinite(value) || typeof currency !== "string") throw mismatch("price");
    if (typeof departure !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(departure)) throw mismatch("departureDate");
    return {
      origin: iataOf(outbound.departureAirport, "departureAirport"),
      destination: iataOf(outbound.arrivalAirport, "arrivalAirport"),
      date: departure.slice(0, 10),
      price: value,
      currency,
    };
  });
}

export class RyanairProvider implements FlightProvider {
  readonly name = "ryanair";
  readonly meteredRequests = true;
  readonly rangeQueries = true;
  /** Ryanair throttles aggressively, so this provider runs gentler than the global default. */
  static readonly defaultConcurrency = 2;

  private readonly fetchImpl: typeof fetch;
  // Airports of one country share a single country-wide call. The in-flight promise is cached so
  // concurrent lookups do not each spend a request.
  private readonly shared: TtlCache<Promise<FareLeg[]>>;

  constructor(config: RyanairConfig = {}) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.shared = new TtlCache<Promise<FareLeg[]>>(config.cacheTtlMs ?? 20 * 60_000, 500, config.now);
  }

  async searchOffers(query: OfferQuery, options: SearchOptions = {}): Promise<Offer[]> {
    // A destination in the bundled dataset is priced country-wide (shareable across its airports);
    // anything else, such as a return to an origin outside the dataset, is asked for by airport.
    const country = findAirport(query.destination)?.country;
    const key = [query.origin, country ?? query.destination, query.date, query.dateTo ?? "", query.currency].join("|");

    let pending = this.shared.get(key);
    if (!pending) {
      const request = this.fetchFares(query, country, options);
      pending = request;
      this.shared.set(key, request);
      // A failed call must not be replayed from cache, or retries would just re-read the failure.
      request.catch(() => this.shared.delete(key));
    }
    const fares = await pending;

    return fares
      .filter((f) => f.origin === query.origin && f.destination === query.destination)
      // A country-wide response can include airports the dataset lacks; those never become offers.
      .filter((f) => country === undefined || findAirport(f.destination)?.country === country)
      .map((f) => ({ ...f, carriers: ["FR"] }));
  }

  private async fetchFares(query: OfferQuery, country: string | undefined, options: SearchOptions): Promise<FareLeg[]> {
    const params = new URLSearchParams({
      departureAirportIataCode: query.origin,
      outboundDepartureDateFrom: query.date,
      outboundDepartureDateTo: query.dateTo ?? query.date,
      currency: query.currency,
      limit: "100",
    });
    if (country) params.set("arrivalCountryCode", country);
    else params.set("arrivalAirportIataCode", query.destination);

    // Counted here, not per lookup: shared and cached lookups never reach this line.
    options.onRequest?.();
    const res = await this.fetchImpl(`${RYANAIR_FARES_URL}?${params}`, {
      headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "application/json" },
      signal: options.signal,
    });
    if (res.status === 429) throw new ProviderError("Ryanair rate limit (HTTP 429)", 429);
    if (res.status === 403) throw new ProviderError("Ryanair refused the request (HTTP 403)", 403);
    if (!res.ok) throw new ProviderError(`Ryanair fare request failed with HTTP ${res.status}`, res.status);

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw mismatch("body is not JSON");
    }
    return parseFares(body);
  }
}
