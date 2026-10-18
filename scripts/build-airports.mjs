// Regenerates data/airports.json from the public OurAirports CSVs.
//
// Usage: node scripts/build-airports.mjs [--countries=ES,IT,PT,FR,GR,TH] [--out=data/airports.json]
// The country list can also come from the AIRPORT_COUNTRIES env var.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const BASE = "https://davidmegginson.github.io/ourairports-data";
const DEFAULT_COUNTRIES = ["ES", "IT", "PT", "FR", "GR", "TH"];

// OurAirports has no metro-area concept, so same-metro airports are listed by hand.
// Anything not listed is its own metro, keyed by IATA code.
const METRO_GROUPS = {
  MIL: { name: "Milan", airports: ["MXP", "LIN", "BGY"] },
  ROM: { name: "Rome", airports: ["FCO", "CIA"] },
  PAR: { name: "Paris", airports: ["CDG", "ORY", "BVA"] },
  BKK: { name: "Bangkok", airports: ["BKK", "DMK"] },
  VCE: { name: "Venice", airports: ["VCE", "TSF"] },
  LIS: { name: "Lisbon", airports: ["LIS"] },
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
};

function trafficRank(country, iata) {
  const index = (TRAFFIC_ORDER[country] ?? []).indexOf(iata);
  return index === -1 ? {} : { rank: index + 1 };
}

function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

// Minimal RFC 4180 parser: OurAirports quotes names that contain commas.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

async function download(name) {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`Download of ${name} failed with HTTP ${res.status}`);
  return parseCsv(await res.text());
}

function metroFor(iata, city) {
  for (const [code, group] of Object.entries(METRO_GROUPS)) {
    if (group.airports.includes(iata)) return { metro: code, metroName: group.name };
  }
  return { metro: iata, metroName: city };
}

export function buildAirports(airportRows, countryRows, countries) {
  const wanted = new Set(countries);
  const airports = airportRows
    .filter(
      (r) =>
        wanted.has(r.iso_country) &&
        r.scheduled_service === "yes" &&
        /^[A-Z]{3}$/.test(r.iata_code) &&
        ["large_airport", "medium_airport", "small_airport"].includes(r.type),
    )
    .map((r) => {
      // Municipalities like "Ferno (VA)" carry a province suffix we do not want to display.
      const city = (r.municipality || r.name).replace(/\s*\(.*\)\s*$/, "");
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
    countryRows.filter((c) => wanted.has(c.code)).map((c) => [c.code, c.name]),
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
  await writeFile(out, JSON.stringify(dataset, null, 1) + "\n");
  console.log(`Wrote ${dataset.airports.length} airports for ${countries.join(", ")} to ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
