// Server-only: builds what the client UI gets about countries, so the airport dataset stays off the client bundle.
import { candidateAirports, supportedCountries } from "@/lib/airports";
import { loadSearchConfig } from "@/lib/server/config";
import { getProviderSelection } from "@/lib/server/provider-select";
import type { CountryAnchors, CountryOption, LiteAirport } from "./lib/types";

const round2 = (n: number) => Math.round(n * 100) / 100;

function searchCap(): number | undefined {
  return loadSearchConfig(process.env, getProviderSelection().defaults).maxAirportsPerCountry;
}

/** The airports a search of this country prices, busiest first: the same cap the search applies. */
export function countryAirports(code: string): LiteAirport[] {
  const cap = searchCap();
  return candidateAirports(code, [], cap ?? Infinity, cap !== undefined).map((a) => ({
    iata: a.iata,
    city: a.metroName,
    metro: a.metro,
    lat: round2(a.lat),
    lon: round2(a.lon),
  }));
}

export function countryOptions(): CountryOption[] {
  return Object.entries(supportedCountries())
    .map(([code, name]) => ({ code, name, airportCount: countryAirports(code).length }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Busiest airport per country: where the map puts a dot for a country too small for the world outline. */
export function countryAnchors(): CountryAnchors {
  return Object.fromEntries(
    Object.keys(supportedCountries()).flatMap((code) => {
      const top = candidateAirports(code, [], 1)[0];
      return top ? [[code, [round2(top.lon), round2(top.lat)] as [number, number]]] : [];
    }),
  );
}
