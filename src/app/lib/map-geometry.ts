// Pure geometry for the results map: which airports frame the view, and where trip arrows meet its edge.

export interface LatLon {
  lat: number;
  lon: number;
}

export type Point = [number, number];

const EARTH_RADIUS_KM = 6371;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function distanceKm(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid] ?? 0;
  return sorted.length % 2 ? hi : ((sorted[mid - 1] ?? hi) + hi) / 2;
}

// A compact country (the Netherlands, Croatia) never loses an airport to the outlier rule.
const MIN_OUTLIER_KM = 400;
const OUTLIER_FACTOR = 2;

/**
 * Splits airports into the ones the map frames and far-flung ones (Hawaii, the Canaries, the Azores).
 * A point is an outlier when it lies more than twice the median distance from the median
 * position. A fixed percentile cannot do this: Hawaii and Alaska are a fifth of US airports, so a
 * 95th-percentile cut would still keep most of them and shrink the mainland to a strip.
 */
export function splitOutliers<T extends LatLon>(points: T[]): { framed: T[]; outliers: T[] } {
  if (points.length < 3) return { framed: points, outliers: [] };
  const center = { lat: median(points.map((p) => p.lat)), lon: median(points.map((p) => p.lon)) };
  const distances = points.map((p) => distanceKm(center, p));
  const limit = Math.max(MIN_OUTLIER_KM, OUTLIER_FACTOR * median(distances));
  const framed: T[] = [];
  const outliers: T[] = [];
  points.forEach((p, i) => ((distances[i] ?? 0) <= limit ? framed : outliers).push(p));
  return { framed, outliers };
}

/** Initial great-circle bearing in degrees clockwise from north. */
export function bearingDeg(from: LatLon, to: LatLon): number {
  const y = Math.sin(rad(to.lon - from.lon)) * Math.cos(rad(to.lat));
  const x =
    Math.cos(rad(from.lat)) * Math.sin(rad(to.lat)) -
    Math.sin(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.cos(rad(to.lon - from.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Where a ray from `p` heading `bearing` (screen north is up) leaves the frame inset by `inset`.
 * Mercator keeps local angles, so a compass bearing is also the on-screen direction.
 */
export function edgePoint(p: Point, bearing: number, width: number, height: number, inset: number): Point {
  const dx = Math.sin(rad(bearing));
  const dy = -Math.cos(rad(bearing));
  const hits: number[] = [];
  if (dx > 1e-9) hits.push((width - inset - p[0]) / dx);
  if (dx < -1e-9) hits.push((inset - p[0]) / dx);
  if (dy > 1e-9) hits.push((height - inset - p[1]) / dy);
  if (dy < -1e-9) hits.push((inset - p[1]) / dy);
  const t = Math.max(0, Math.min(...hits));
  return [p[0] + dx * t, p[1] + dy * t];
}

export function insideFrame(p: Point, width: number, height: number, inset: number): boolean {
  return p[0] >= inset && p[0] <= width - inset && p[1] >= inset && p[1] <= height - inset;
}

/** Pins an off-map point to the frame edge along the line from the frame centre, so it still points the right way. */
export function pinToFrame(p: Point, width: number, height: number, inset: number): Point {
  if (insideFrame(p, width, height, inset)) return p;
  const c: Point = [width / 2, height / 2];
  const bearing = (Math.atan2(p[0] - c[0], -(p[1] - c[1])) * 180) / Math.PI;
  return edgePoint(c, bearing, width, height, inset);
}
