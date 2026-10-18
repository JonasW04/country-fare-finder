"use client";

import { useState } from "react";
import type { RegionId } from "../lib/map-regions";
import type { ViewTransform } from "../lib/map-view";

export type MapView = { kind: "world" } | { kind: "region"; id: RegionId } | { kind: "country" };

/**
 * What the map frames. It follows the chosen country: a new country from the search bar, or a
 * search starting, zooms in; Back to world and the region buttons zoom out without unchoosing it.
 */
export function useMapView(country: string, searching: boolean) {
  const [view, setView] = useState<MapView>(searching ? { kind: "country" } : { kind: "world" });
  // Previous inputs, compared during render: React's pattern for state that follows props.
  const [seen, setSeen] = useState({ country, searching });
  if (seen.country !== country || seen.searching !== searching) {
    setSeen({ country, searching });
    if (seen.country !== country || (searching && !seen.searching)) setView({ kind: "country" });
  }
  return [view, setView] as const;
}

const same = (a: ViewTransform, b: ViewTransform) => a.k === b.k && a.x === b.x && a.y === b.y;

/**
 * The last transform known. While a country's airports load there is no target yet; holding the
 * old frame avoids zooming first to the outline (the US with Alaska) and then again to the airports.
 */
export function useHeldTransform(target: ViewTransform | null): ViewTransform | null {
  const [held, setHeld] = useState<ViewTransform | null>(target);
  if (target && (held === null || !same(held, target))) setHeld(target);
  return target ?? held;
}
