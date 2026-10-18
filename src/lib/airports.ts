import dataset from "../../data/airports.json";
import originsData from "../../data/origins.json";

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

export interface OriginAirport {
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
}

// Server-only: origins.json is a few hundred KB and must not be imported into a client component.
const origins = originsData as OriginAirport[];

/** Looks in the destination dataset first, then the worldwide origin list. */
export function findAnyAirport(iata: string): OriginAirport | undefined {
  const code = iata.toUpperCase();
  const known = findAirport(code) ?? origins.find((a) => a.iata === code);
  if (!known) return undefined;
  const { name, city, country, lat, lon } = known;
  return { iata: known.iata, name, city, country, lat, lon };
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Origin lookup for the search box: exact IATA first, then city prefix, then name or city
 * substring. origins.json is written large airports first, so within one match quality the
 * stable sort keeps a big hub ahead of a regional field.
 */
export function searchOrigins(q: string, limit = 8): Omit<OriginAirport, "lat" | "lon">[] {
  const needle = fold(q.trim());
  if (!needle) return [];
  const scored: { airport: OriginAirport; score: number }[] = [];
  for (const airport of origins) {
    const city = fold(airport.city);
    let score: number;
    if (airport.iata.toLowerCase() === needle) score = 0;
    else if (city.startsWith(needle)) score = 1;
    else if (city.includes(needle) || fold(airport.name).includes(needle)) score = 2;
    else continue;
    scored.push({ airport, score });
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ airport: { iata, name, city, country } }) => ({ iata, name, city, country }));
}
