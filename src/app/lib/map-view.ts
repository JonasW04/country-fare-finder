// Pure maths for the zoomable map: which lon/lat box to show and the transform that frames it.
import { splitOutliers, type LatLon, type Point } from "./map-geometry";

/** Degrees: west, south, east, north. */
export interface GeoBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** A projected rectangle, [[x0, y0], [x1, y1]]. */
export type Bounds = [Point, Point];

/** Screen point = projected point × k + (x, y). */
export interface ViewTransform {
  k: number;
  x: number;
  y: number;
}

// A single airport or a tight cluster (Malta) would otherwise zoom in until the country is a blur.
const MIN_SPAN_DEG = 3;

function grow(lo: number, hi: number): [number, number] {
  const extra = Math.max(0, MIN_SPAN_DEG - (hi - lo)) / 2;
  return [lo - extra, hi + extra];
}

/**
 * The box around the airports people fly to. Far territories (Hawaii, the Canaries) are left out
 * by the outlier rule, so the US frames the mainland and Spain the peninsula.
 */
export function airportBox(points: LatLon[]): GeoBox | null {
  const { framed } = splitOutliers(points);
  if (framed.length === 0) return null;
  const [south, north] = grow(Math.min(...framed.map((p) => p.lat)), Math.max(...framed.map((p) => p.lat)));
  const [west, east] = grow(Math.min(...framed.map((p) => p.lon)), Math.max(...framed.map((p) => p.lon)));
  return { west, south, east, north };
}

export function pointBox(lon: number, lat: number): GeoBox {
  return { west: lon - MIN_SPAN_DEG / 2, east: lon + MIN_SPAN_DEG / 2, south: lat - MIN_SPAN_DEG / 2, north: lat + MIN_SPAN_DEG / 2 };
}

const EDGE_SAMPLES = 8;

/**
 * Projected bounds of a lon/lat box. Equal Earth bends the meridians, so the corners alone would
 * cut off the bulge of the box's edges; sampling along each edge catches it.
 */
export function projectBox(project: (lonLat: [number, number]) => Point | null, box: GeoBox): Bounds | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= EDGE_SAMPLES; i++) {
    const t = i / EDGE_SAMPLES;
    const lon = box.west + (box.east - box.west) * t;
    const lat = box.south + (box.north - box.south) * t;
    for (const ll of [[lon, box.south], [lon, box.north], [box.west, lat], [box.east, lat]] as [number, number][]) {
      const p = project(ll);
      if (p) {
        xs.push(p[0]);
        ys.push(p[1]);
      }
    }
  }
  if (xs.length === 0) return null;
  return [
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
  ];
}

/** Scale and offset that centre `bounds` in a width × height frame with `pad` pixels to spare. */
export function fitTransform(bounds: Bounds, width: number, height: number, pad: number): ViewTransform {
  const [[x0, y0], [x1, y1]] = bounds;
  const bw = Math.max(x1 - x0, 1e-6);
  const bh = Math.max(y1 - y0, 1e-6);
  const k = Math.max(1e-6, Math.min((width - 2 * pad) / bw, (height - 2 * pad) / bh));
  return { k, x: width / 2 - k * ((x0 + x1) / 2), y: height / 2 - k * ((y0 + y1) / 2) };
}

export function applyTransform(t: ViewTransform, p: Point): Point {
  return [p[0] * t.k + t.x, p[1] * t.k + t.y];
}
