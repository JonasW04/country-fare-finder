import { geoMercator, type GeoProjection } from "d3-geo";
import type { Feature, Geometry } from "geojson";
import { splitOutliers, type LatLon } from "./map-geometry";

// A single airport or a tight cluster would otherwise zoom in until the country disappears.
const MIN_SPAN_DEG = 3;

/**
 * Mercator fitted to the airports rather than the outline: outlines carry far territories (Hawaii,
 * the Canaries) that would shrink the part people fly to. With no airports, the outline is used.
 */
export function fitProjection(points: LatLon[], width: number, height: number, pad: number, shape: Feature<Geometry> | null): GeoProjection | null {
  const extent: [[number, number], [number, number]] = [
    [pad, pad],
    [width - pad, height - pad],
  ];
  const { framed } = splitOutliers(points);
  if (framed.length === 0) return shape ? geoMercator().fitExtent(extent, shape) : null;
  const lats = framed.map((p) => p.lat);
  const lons = framed.map((p) => p.lon);
  const grow = (lo: number, hi: number): [number, number] => {
    const extra = Math.max(0, MIN_SPAN_DEG - (hi - lo)) / 2;
    return [lo - extra, hi + extra];
  };
  const [latLo, latHi] = grow(Math.min(...lats), Math.max(...lats));
  const [lonLo, lonHi] = grow(Math.min(...lons), Math.max(...lons));
  return geoMercator().fitExtent(extent, {
    type: "MultiPoint",
    coordinates: [
      [lonLo, latLo],
      [lonHi, latHi],
    ],
  });
}
