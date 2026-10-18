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
  /** Hand-kept traffic order within the country (1 = busiest); absent for airports nobody ranked. */
  rank?: number;
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
 * Busiest airports first so a limited call budget is spent on the destinations people actually
 * fly to. OurAirports marks dozens of airports "large", so traffic rank leads, then size, then
 * IATA for stability; unranked airports follow the ranked ones. Metro siblings all stay in
 * unless deduped: ranking merges them, and the cheaper sibling may be the one that wins.
 */
export function candidateAirports(
  country: string,
  exclude: string[] = [],
  limit = Infinity,
  dedupeMetros = false,
): Airport[] {
  const skip = new Set(exclude.map((c) => c.toUpperCase()));
  const sorted = airportsForCountry(country)
    .filter((a) => !skip.has(a.iata))
    .sort(
      (a, b) =>
        (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
        SIZE_ORDER[a.size] - SIZE_ORDER[b.size] ||
        a.iata.localeCompare(b.iata),
    );
  if (!dedupeMetros) return sorted.slice(0, limit);
  // Sorted busiest first, so the first airport seen for a metro is its busiest one.
  const seen = new Set<string>();
  return sorted.filter((a) => !seen.has(a.metro) && seen.add(a.metro)).slice(0, limit);
}
