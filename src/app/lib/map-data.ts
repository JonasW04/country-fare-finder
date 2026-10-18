import type { SearchResponse } from "@/lib/server/search";
import type { LatLon } from "./map-geometry";
import type { LiteAirport } from "./types";

export interface MapAirport extends LiteAirport {
  cheapestOut?: number;
}

const located = (a: { lat?: number; lon?: number }): a is LatLon =>
  Number.isFinite(a.lat) && Number.isFinite(a.lon);

/**
 * The search's own airport list when it has one. Otherwise the country's bundled airports, priced
 * from the ranked trips, so the map still works against a search that does not report airports.
 */
export function mapAirports(response: SearchResponse, fallback: LiteAirport[]): MapAirport[] {
  const fromSearch = response.airports.filter(located);
  if (fromSearch.length > 0) return fromSearch;
  const cheapest = new Map<string, number>();
  for (const c of response.combinations) {
    const seen = cheapest.get(c.flyIn.metro);
    if (seen === undefined || c.outbound.price < seen) cheapest.set(c.flyIn.metro, c.outbound.price);
  }
  return fallback.map((a) => ({ ...a, cheapestOut: cheapest.get(a.metro) }));
}

/** Where the first origin is, from the search or the bundled airports; null when neither knows. */
export function originLocation(response: SearchResponse, known: LiteAirport[]): LatLon | null {
  const origin = response.origins[0];
  if (origin && located(origin)) return { lat: origin.lat, lon: origin.lon };
  const code = origin?.iata ?? response.request.origin;
  const match = known.find((a) => a.iata === code);
  return match ? { lat: match.lat, lon: match.lon } : null;
}
