// Cabin and currency are pass-through strings: each provider decides what it accepts.
export interface OfferQuery {
  origin: string;
  destination: string;
  /** ISO date (YYYY-MM-DD) of the one-way departure. */
  date: string;
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
}

export interface FlightProvider {
  readonly name: string;
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
