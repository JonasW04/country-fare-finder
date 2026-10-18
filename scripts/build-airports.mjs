// Regenerates data/airports.json from the public OurAirports CSVs.
//
// Usage: node scripts/build-airports.mjs [--countries=ALL|ES,IT,...] [--out=data/airports.json]
// The country list can also come from the AIRPORT_COUNTRIES env var.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { CITY_NAMES } from "./city-names.mjs";
import { cityFor, download, parseArgs } from "./ourairports.mjs";

// Every country OurAirports lists that has at least one airport with scheduled service.
const DEFAULT_COUNTRIES = ["ALL"];

// OurAirports has no metro-area concept, so same-metro airports are listed by hand.
// Anything not listed is its own metro, keyed by IATA code.
const METRO_GROUPS = {
  MIL: { name: "Milan", airports: ["MXP", "LIN", "BGY"] },
  ROM: { name: "Rome", airports: ["FCO", "CIA"] },
  PAR: { name: "Paris", airports: ["CDG", "ORY", "BVA"] },
  BKK: { name: "Bangkok", airports: ["BKK", "DMK"] },
  VCE: { name: "Venice", airports: ["VCE", "TSF"] },
  LIS: { name: "Lisbon", airports: ["LIS"] },
  LON: { name: "London", airports: ["LHR", "LGW", "STN", "LTN", "LCY", "SEN"] },
  NYC: { name: "New York", airports: ["JFK", "LGA", "EWR"] },
  WAS: { name: "Washington", airports: ["IAD", "DCA", "BWI"] },
  CHI: { name: "Chicago", airports: ["ORD", "MDW"] },
  TYO: { name: "Tokyo", airports: ["HND", "NRT"] },
  OSA: { name: "Osaka", airports: ["KIX", "ITM", "UKB"] },
  STO: { name: "Stockholm", airports: ["ARN", "BMA", "NYO"] },
  OSL: { name: "Oslo", airports: ["OSL", "TRF", "RYG"] },
  IST: { name: "Istanbul", airports: ["IST", "SAW"] },
};

// OurAirports marks dozens of airports "large", so size alone cannot say which ones matter. This is a
// hand-kept busiest-first order by annual passengers; an airport's rank is its position (1 = busiest).
// Airports not listed get no rank and sort after every ranked one.
const TRAFFIC_ORDER = {
  IT: ["FCO", "MXP", "BGY", "NAP", "VCE", "CTA", "BLQ", "PMO", "LIN", "CAG", "BRI", "PSA", "TRN", "OLB"],
  ES: ["MAD", "BCN", "PMI", "AGP", "ALC", "LPA", "TFS", "VLC", "SVQ", "IBZ", "BIO", "ACE", "FUE", "TFN"],
  PT: ["LIS", "OPO", "FAO", "FNC", "PDL"],
  FR: ["CDG", "ORY", "NCE", "LYS", "MRS", "TLS", "BOD", "NTE", "BVA", "MPL"],
  GR: ["ATH", "HER", "SKG", "RHO", "CFU", "CHQ", "JTR", "JMK", "KGS", "ZTH"],
  TH: ["BKK", "DMK", "HKT", "CNX", "USM", "KBV", "HDY"],
  DE: ["FRA", "MUC", "DUS", "BER", "HAM", "CGN", "STR", "HAJ", "NUE", "LEJ"],
  GB: ["LHR", "LGW", "MAN", "STN", "EDI", "BHX", "GLA", "BRS", "LTN", "NCL", "BFS", "LPL"],
  NL: ["AMS", "EIN", "RTM", "MST", "GRQ"],
  HR: ["ZAG", "SPU", "DBV", "ZAD", "PUY", "RJK", "OSI"],
  NO: ["OSL", "BGO", "TRD", "SVG", "TOS", "BOO", "AES", "KRS", "TRF"],
  SE: ["ARN", "GOT", "BMA", "NYO", "MMX", "LLA", "UME", "OSD"],
  TR: ["IST", "SAW", "AYT", "ESB", "ADB", "DLM", "BJV", "TZX", "GZT", "ASR"],
  US: ["ATL", "DFW", "DEN", "ORD", "LAX", "JFK", "CLT", "LAS", "MCO", "MIA", "PHX", "SEA", "SFO", "EWR", "IAH"],
  JP: ["HND", "NRT", "KIX", "FUK", "CTS", "OKA", "NGO", "ITM", "KOJ", "HIJ", "SDJ", "UKB"],
};

function trafficRank(country, iata) {
  const index = (TRAFFIC_ORDER[country] ?? []).indexOf(iata);
  return index === -1 ? {} : { rank: index + 1 };
}

function metroFor(iata, city) {
  for (const [code, group] of Object.entries(METRO_GROUPS)) {
    if (group.airports.includes(iata)) return { metro: code, metroName: group.name };
  }
  return { metro: iata, metroName: CITY_NAMES[iata] ?? city };
}

export function buildAirports(airportRows, countryRows, countries) {
  const wanted = new Set(countries.includes("ALL") ? countryRows.map((c) => c.code) : countries);
  const airports = airportRows
    .filter(
      (r) =>
        wanted.has(r.iso_country) &&
        r.scheduled_service === "yes" &&
        /^[A-Z]{3}$/.test(r.iata_code) &&
        ["large_airport", "medium_airport", "small_airport"].includes(r.type),
    )
    .map((r) => {
      const city = cityFor(r);
      return {
        iata: r.iata_code,
        name: r.name,
        city,
        country: r.iso_country,
        size: r.type.replace("_airport", ""),
        ...trafficRank(r.iso_country, r.iata_code),
        ...metroFor(r.iata_code, city),
        lat: Number(Number(r.latitude_deg).toFixed(4)),
        lon: Number(Number(r.longitude_deg).toFixed(4)),
      };
    })
    .sort((a, b) => a.country.localeCompare(b.country) || a.iata.localeCompare(b.iata));

  const names = Object.fromEntries(
    // A country with no qualifying airport cannot be searched, so it is left out of the picker.
    countryRows.filter((c) => airports.some((a) => a.country === c.code)).map((c) => [c.code, c.name]),
  );
  return { source: "OurAirports (public domain)", countries: names, airports };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const countries = (args.countries ?? process.env.AIRPORT_COUNTRIES ?? DEFAULT_COUNTRIES.join(","))
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  const out = args.out ?? fileURLToPath(new URL("../data/airports.json", import.meta.url));

  const [airportRows, countryRows] = await Promise.all([
    download("airports.csv"),
    download("countries.csv"),
  ]);
  const dataset = buildAirports(airportRows, countryRows, countries);
  // One airport per line keeps the file small and its diffs readable.
  const body = [
    "{",
    ` "source": ${JSON.stringify(dataset.source)},`,
    ` "countries": ${JSON.stringify(dataset.countries)},`,
    ' "airports": [',
    dataset.airports.map((a) => `  ${JSON.stringify(a)}`).join(",\n"),
    " ]",
    "}",
  ].join("\n");
  await writeFile(out, body + "\n");
  const count = Object.keys(dataset.countries).length;
  console.log(`Wrote ${dataset.airports.length} airports in ${count} countries to ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
