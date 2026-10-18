// Writes public/shapes/<ISO2>.json: one GeoJSON Feature per destination country, for the results map.
// Source is world-atlas (Natural Earth 50m, keyed by ISO 3166-1 numeric). Re-run after changing COUNTRIES:
//   node scripts/build-shapes.mjs
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { feature } from "topojson-client";

// world-atlas ids are ISO numeric codes stored as zero-padded strings.
const COUNTRIES = {
  ES: "724",
  IT: "380",
  PT: "620",
  FR: "250",
  GR: "300",
  TH: "764",
  DE: "276",
  GB: "826",
  NL: "528",
  HR: "191",
  NO: "578",
  SE: "752",
  TR: "792",
  US: "840",
  JP: "392",
};

// Two decimals is about 1 km, far finer than a map card a few hundred pixels wide can show.
const PRECISION = 100;

function round(coords) {
  if (typeof coords[0] === "number") return coords.map((c) => Math.round(c * PRECISION) / PRECISION);
  return coords.map(round);
}

/** Drops consecutive duplicate points that rounding creates, and rings that collapse below a triangle. */
function dedupe(geometry) {
  const ring = (r) => r.filter((p, i) => i === 0 || p[0] !== r[i - 1][0] || p[1] !== r[i - 1][1]);
  const valid = (r) => r.length >= 4;
  if (geometry.type === "Polygon") {
    return { type: "Polygon", coordinates: geometry.coordinates.map(ring).filter(valid) };
  }
  return {
    type: "MultiPolygon",
    coordinates: geometry.coordinates.map((poly) => poly.map(ring).filter(valid)).filter((poly) => poly.length > 0),
  };
}

const require = createRequire(import.meta.url);
const topology = JSON.parse(await readFile(require.resolve("world-atlas/countries-50m.json"), "utf8"));
const all = feature(topology, topology.objects.countries).features;

const outDir = new URL("../public/shapes/", import.meta.url);
await mkdir(outDir, { recursive: true });

for (const [iso2, id] of Object.entries(COUNTRIES)) {
  const found = all.find((f) => f.id === id);
  if (!found) throw new Error(`No world-atlas feature with id ${id} for ${iso2}`);
  const geometry = dedupe({ type: found.geometry.type, coordinates: round(found.geometry.coordinates) });
  const out = { type: "Feature", id: iso2, properties: { name: found.properties.name }, geometry };
  await writeFile(new URL(`${iso2}.json`, outDir), JSON.stringify(out));
  console.log(`${iso2} ${found.properties.name}`);
}
