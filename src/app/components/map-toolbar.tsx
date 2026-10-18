"use client";

import { REGIONS } from "../lib/map-regions";
import type { MapView } from "./use-map-view";

interface Props {
  view: MapView;
  onView: (view: MapView) => void;
}

/** Region shortcuts above the map; one row that scrolls sideways on phones rather than wrapping. */
export function MapToolbar({ view, onView }: Props) {
  return (
    <div className="flex items-center gap-x-3 overflow-x-auto border-b border-rule px-3 py-2 text-[13px] whitespace-nowrap">
      {REGIONS.map((r) => {
        const active = r.id === "world" ? view.kind === "world" : view.kind === "region" && view.id === r.id;
        return (
          <button
            key={r.id}
            type="button"
            aria-pressed={active}
            onClick={() => onView(r.id === "world" ? { kind: "world" } : { kind: "region", id: r.id })}
            className={active ? "font-medium text-text" : "text-subtle hover:text-text"}
          >
            {r.label}
          </button>
        );
      })}
      {view.kind !== "world" ? (
        <button type="button" onClick={() => onView({ kind: "world" })} className="ml-auto pl-3 text-accent-text hover:underline">
          Back to world
        </button>
      ) : null}
    </div>
  );
}
