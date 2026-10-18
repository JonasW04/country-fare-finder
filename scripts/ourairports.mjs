// CSV download and parsing shared by build-airports.mjs and build-origins.mjs.
import { CITY_NAMES } from "./city-names.mjs";

const BASE = "https://davidmegginson.github.io/ourairports-data";

// Minimal RFC 4180 parser: OurAirports quotes names that contain commas.
export function parseCsv(text) {
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

export async function download(name) {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`Download of ${name} failed with HTTP ${res.status}`);
  return parseCsv(await res.text());
}

// The name a traveller books to: the hand-kept override, else the OurAirports municipality.
// Municipalities like "Ferno (VA)" carry a province suffix we do not want to display.
export function cityFor(row) {
  const override = CITY_NAMES[row.iata_code];
  if (override) return override;
  return (row.municipality || row.name).replace(/\s*\(.*\)\s*$/, "");
}

export function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) args[m[1]] = m[2];
  }
  return args;
}
