// Regenerates data/origins.json: a compact worldwide list of airports a traveller could depart from,
// used for the origin lookup. Usage: node scripts/build-origins.mjs [--out=data/origins.json]
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { cityFor, download, parseArgs } from "./ourairports.mjs";

// Large airports come first in the file: the origin search relies on that order to rank a hub above
// a regional field when both match equally well, so the output carries no size field.
export function buildOrigins(airportRows) {
  const sizeOrder = { large_airport: 0, medium_airport: 1 };
  return airportRows
    .filter(
      (r) =>
        r.scheduled_service === "yes" &&
        /^[A-Z]{3}$/.test(r.iata_code) &&
        ["large_airport", "medium_airport"].includes(r.type),
    )
    .sort((a, b) => sizeOrder[a.type] - sizeOrder[b.type] || a.iata_code.localeCompare(b.iata_code))
    .map((r) => ({
      iata: r.iata_code,
      name: r.name,
      city: cityFor(r),
      country: r.iso_country,
      lat: Number(Number(r.latitude_deg).toFixed(3)),
      lon: Number(Number(r.longitude_deg).toFixed(3)),
    }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const out = args.out ?? fileURLToPath(new URL("../data/origins.json", import.meta.url));
  const origins = buildOrigins(await download("airports.csv"));
  // Not pretty-printed: this is a lookup table, not something to read in diffs.
  await writeFile(out, JSON.stringify(origins) + "\n");
  console.log(`Wrote ${origins.length} origin airports to ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
