"use client";

import { memo } from "react";
import type { CountryOption } from "../lib/types";

export interface WorldFeature {
  code: string | null;
  d: string;
}

interface Props {
  features: WorldFeature[];
  byCode: Map<string, CountryOption>;
  /** The one country path in the tab order; the rest are focusable by pointer only, so the map is one tab stop. */
  tabCode: string | null;
}

export const airportsText = (n: number) => `${n} ${n === 1 ? "airport" : "airports"}`;

/**
 * Every 110m country, drawn once in projected space. Memoised: hover and tooltip state change on
 * every pointer move, and redrawing 176 paths each time would make the pointer lag.
 * Clicks, hovers and Enter are handled by the parent through `data-code`.
 */
export const WorldLayer = memo(function WorldLayer({ features, byCode, tabCode }: Props) {
  return (
    <>
      {features.map((f, i) => {
        const option = f.code ? byCode.get(f.code) : undefined;
        if (!option) {
          return <path key={f.code ?? `none-${i}`} d={f.d} aria-hidden className="fill-land-empty stroke-bg" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />;
        }
        return (
          <path
            key={option.code}
            d={f.d}
            data-code={option.code}
            role="button"
            tabIndex={option.code === tabCode ? 0 : -1}
            aria-label={`${option.name}, ${airportsText(option.airportCount)}`}
            className="cursor-pointer fill-land stroke-bg outline-none focus-visible:fill-accent/60"
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </>
  );
});
