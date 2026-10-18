import { NextResponse } from "next/server";
import { supportedCountries } from "@/lib/airports";
import { countryAirports } from "@/app/country-options";

// The airports a search of one country would price, fetched when the map zooms in, so the page
// does not ship every country's list up front.
export function GET(request: Request): NextResponse {
  const code = (new URL(request.url).searchParams.get("country") ?? "").trim().toUpperCase();
  if (!Object.hasOwn(supportedCountries(), code)) {
    return NextResponse.json({ errors: ["country must be a supported ISO 3166-1 alpha-2 code"] }, { status: 400 });
  }
  return NextResponse.json(countryAirports(code));
}
