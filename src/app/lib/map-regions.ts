import type { GeoBox } from "./map-view";

export type RegionId = "world" | "europe" | "middle-east" | "asia" | "africa" | "north-america" | "south-america" | "oceania";

/** Hand-set boxes: each frames where the region's airports are, not its full extent (no Arctic, no Alaska). */
export const REGIONS: { id: RegionId; label: string; box: GeoBox | null }[] = [
  { id: "world", label: "World", box: null },
  { id: "europe", label: "Europe", box: { west: -25, south: 34, east: 45, north: 71 } },
  { id: "middle-east", label: "Middle East", box: { west: 25, south: 12, east: 63, north: 42 } },
  { id: "asia", label: "Asia", box: { west: 60, south: -10, east: 150, north: 55 } },
  { id: "africa", label: "Africa", box: { west: -20, south: -36, east: 55, north: 38 } },
  { id: "north-america", label: "North America", box: { west: -130, south: 8, east: -58, north: 58 } },
  { id: "south-america", label: "South America", box: { west: -85, south: -56, east: -33, north: 13 } },
  { id: "oceania", label: "Oceania", box: { west: 110, south: -48, east: 180, north: 0 } },
];
