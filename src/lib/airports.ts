import dataset from "../../data/airports.json";

export interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
  size: "large" | "medium" | "small";
  /** Airports sharing a metro code are the same destination for ranking. */
  metro: string;
  metroName: string;
  lat: number;
  lon: number;
}

const airports = dataset.airports as Airport[];

export function supportedCountries(): Record<string, string> {
  return dataset.countries;
}

export function airportsForCountry(country: string): Airport[] {
  return airports.filter((a) => a.country === country.toUpperCase());
}

export function findAirport(iata: string): Airport | undefined {
  return airports.find((a) => a.iata === iata.toUpperCase());
}

const SIZE_ORDER = { large: 0, medium: 1, small: 2 } as const;

/**
 * Largest airports first (then IATA for stability) so a limited call budget is spent on
 * the destinations people actually fly to. Metro siblings all stay in: ranking dedupes
 * them, and the cheaper sibling may be the one that wins.
 */
export function candidateAirports(country: string, exclude: string[] = [], limit = Infinity): Airport[] {
  const skip = new Set(exclude.map((c) => c.toUpperCase()));
  const sorted = airportsForCountry(country)
    .filter((a) => !skip.has(a.iata))
    .sort((a, b) => SIZE_ORDER[a.size] - SIZE_ORDER[b.size] || a.iata.localeCompare(b.iata));
  return sorted.slice(0, limit);
}
