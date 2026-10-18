// Server-only: builds the country list the client UI gets as props, so the airport dataset stays off the client bundle.
import { candidateAirports, supportedCountries } from "@/lib/airports";
import { loadSearchConfig } from "@/lib/server/config";
import { getProviderSelection } from "@/lib/server/provider-select";
import type { CountryOption } from "./lib/types";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function countryOptions(): CountryOption[] {
  // The same cap the search applies, so the picker and loading state count the airports really asked.
  const cap = loadSearchConfig(process.env, getProviderSelection().defaults).maxAirportsPerCountry;
  return Object.entries(supportedCountries())
    .map(([code, name]) => ({
      code,
      name,
      airports: candidateAirports(code, [], cap ?? Infinity, cap !== undefined).map((a) => ({
        iata: a.iata,
        city: a.metroName,
        metro: a.metro,
        lat: round2(a.lat),
        lon: round2(a.lon),
      })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
