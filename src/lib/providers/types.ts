// Cabin and currency are pass-through strings: each provider decides what it accepts.
export interface OfferQuery {
  origin: string;
  destination: string;
  /** ISO date (YYYY-MM-DD) of the one-way departure. */
  date: string;
  /** Last day of a departure window starting at `date`; only sent to providers with `rangeQueries`. */
  dateTo?: string;
  cabin: string;
  adults: number;
  currency: string;
}

export interface Offer {
  origin: string;
  destination: string;
  date: string;
  price: number;
  currency: string;
  carriers: string[];
  /** Providers rarely supply a deep link; the search layer fills one in when absent. */
  bookingUrl?: string;
}

export interface SearchOptions {
  signal?: AbortSignal;
  /**
   * Metered providers call this immediately before every real HTTP request. It throws when the
   * search's call budget is spent, so the budget counts requests rather than logical lookups.
   */
  onRequest?: () => void;
}

export interface FlightProvider {
  readonly name: string;
  /** True when the provider reports each HTTP request through `onRequest` (it may share requests between lookups). */
  readonly meteredRequests?: boolean;
  /** True when one query can cover a window (`dateTo`), so return legs need one request per airport, not per date. */
  readonly rangeQueries?: boolean;
  searchOffers(query: OfferQuery, options?: SearchOptions): Promise<Offer[]>;
}

/** Thrown by providers so the retry layer can tell transient failures from permanent ones. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
