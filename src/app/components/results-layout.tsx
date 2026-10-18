import type { ReactNode } from "react";

interface Props {
  map: ReactNode;
  /** Under the map: the idle hint, or the price calendar once there are results. */
  under: ReactNode;
  /** The right column; null before any search, when the map takes the full width. */
  side: ReactNode | null;
}

/**
 * Before a search the map is the page; after one, map and calendar on the left and the trip list on
 * the right (one column on phones). The map keeps its place in the tree in both, so React keeps the
 * same instance and its zoom carries over instead of starting again from the world.
 */
export function ResultsLayout({ map, under, side }: Props) {
  return (
    <div className={side ? "grid gap-4 lg:grid-cols-[minmax(0,58fr)_minmax(0,42fr)]" : ""}>
      <div className={side ? "min-w-0 space-y-4 lg:sticky lg:top-[72px] lg:self-start" : "space-y-3"}>
        {map}
        {under}
      </div>
      {side ? <div className="min-w-0">{side}</div> : null}
    </div>
  );
}
