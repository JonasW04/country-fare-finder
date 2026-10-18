// Shapes the server page hands to the client UI. Kept free of server imports so client code can use them.

/** An airport as the map and loading animation need it. */
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
  /** The airports a search prices, busiest first; their count is what the picker shows. */
  airports: LiteAirport[];
}
