// Shapes the server page hands to the client UI. Kept free of server imports so client code can use them.

/** An airport as the map needs it. */
export interface LiteAirport {
  iata: string;
  city: string;
  metro: string;
  lat: number;
  lon: number;
}

export interface CountryOption {
  code: string;
  name: string;
  /** How many airports a search prices; the list itself comes from /api/country-airports on demand. */
  airportCount: number;
}

/** [lon, lat] of each country's busiest airport, keyed by ISO2. */
export type CountryAnchors = Record<string, [number, number]>;
