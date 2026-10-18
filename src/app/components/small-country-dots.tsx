"use client";

import type { Point } from "../lib/map-geometry";
import type { CountryOption } from "../lib/types";
import { airportsText } from "./world-layer";

export interface SmallCountry {
  option: CountryOption;
  p: Point;
}

interface Props {
  dots: SmallCountry[];
  hovered: string | null;
  selected: string;
}

/**
 * Countries too small for the 110m world (Malta, Singapore, most islands), drawn as a land dot at
 * their busiest airport so every country can be picked on the map. Handled by the parent via data-code.
 */
export function SmallCountryDots({ dots, hovered, selected }: Props) {
  return (
    <>
      {dots.map(({ option, p }) => {
        const tint = option.code === selected ? "fill-accent" : option.code === hovered ? "fill-accent/50" : "fill-land";
        return (
          <g key={option.code}>
            <circle cx={p[0]} cy={p[1]} r={3.5} className={`${tint} stroke-subtle/60`} strokeWidth={0.75} pointerEvents="none" />
            <circle
              cx={p[0]}
              cy={p[1]}
              r={8}
              fill="transparent"
              data-code={option.code}
              role="button"
              tabIndex={-1}
              aria-label={`${option.name}, ${airportsText(option.airportCount)}`}
              className="cursor-pointer outline-none"
            />
          </g>
        );
      })}
    </>
  );
}
