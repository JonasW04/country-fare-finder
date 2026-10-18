// Writes the map shapes the UI fetches at runtime:
//   public/shapes/world.json  - every 110m country, for the world map
//   public/shapes/<ISO2>.json - one outline per destination country in data/airports.json
// Source is world-atlas (Natural Earth, keyed by ISO 3166-1 numeric). Re-run after rebuilding airports:
//   node scripts/build-shapes.mjs
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import countries from "i18n-iso-countries";
import { feature } from "topojson-client";

// Two decimals is about 1 km, far finer than a map a few hundred pixels wide can show.
const PRECISION = 100;

// Natural Earth gives no ISO id to disputed areas. Kosovo has an OurAirports code; the others have
// no ISO country of their own, so they are drawn as plain land on the world map and never priced.
const ISO2_BY_NAME = { Kosovo: "XK" };

// Antarctica has no scheduled airport and would take a fifth of the world map's height.
const SKIP = new Set(["AQ"]);

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

async function load(file) {
  const topology = JSON.parse(await readFile(require.resolve(`world-atlas/${file}`), "utf8"));
  return feature(topology, topology.objects.countries).features.map((f) => ({
    iso2: (f.id === undefined ? ISO2_BY_NAME[f.properties.name] : countries.numericToAlpha2(f.id)) ?? null,
    name: f.properties.name,
    geometry: dedupe({ type: f.geometry.type, coordinates: round(f.geometry.coordinates) }),
  }));
}

const coarse = (await load("countries-110m.json")).filter((f) => !SKIP.has(f.iso2));
const fine = await load("countries-50m.json");
const destinations = JSON.parse(await readFile(new URL("../data/airports.json", import.meta.url), "utf8")).countries;

const outDir = new URL("../public/shapes/", import.meta.url);
await mkdir(outDir, { recursive: true });

const world = {
  type: "FeatureCollection",
  features: coarse.map((f) => ({ type: "Feature", properties: { iso2: f.iso2, name: f.name }, geometry: f.geometry })),
};
await writeFile(new URL("world.json", outDir), JSON.stringify(world));

const missing = [];
let written = 0;
for (const [iso2, name] of Object.entries(destinations)) {
  const found = fine.find((f) => f.iso2 === iso2) ?? coarse.find((f) => f.iso2 === iso2);
  if (!found) {
    missing.push(iso2);
    continue;
  }
  const out = { type: "Feature", id: iso2, properties: { iso2, name }, geometry: found.geometry };
  await writeFile(new URL(`${iso2}.json`, outDir), JSON.stringify(out));
  written += 1;
}
console.log(`world.json: ${world.features.length} countries; ${written} country shapes`);
// Territories Natural Earth folds into another country (Réunion into France) have no outline of their own.
console.log(`no shape: ${missing.join(" ")}`);
