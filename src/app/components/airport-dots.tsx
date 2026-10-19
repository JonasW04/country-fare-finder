"use client";

import { formatMoney } from "../lib/format";
import type { MapAirport } from "../lib/map-data";
import type { Point } from "../lib/map-geometry";
import { placeLabels, type LabelCandidate } from "../lib/map-labels";
import { priceColor, priceExtent } from "../lib/price-scale";

/** "partial": a search is still running but some airports already have prices. */
export type MapPhase = "idle" | "loading" | "partial" | "done";

const showsPrices = (phase: MapPhase) => phase === "done" || phase === "partial";

export interface PlacedAirport {
  a: MapAirport;
  p: Point;
}

interface Props {
  dots: PlacedAirport[];
  phase: MapPhase;
  currency: string;
  width: number;
  /** Metros of the drawn trip: always labelled and drawn larger. */
  tripMetros: string[];
  selectedMetro: string | null;
  onSelectMetro: (metro: string | null) => void;
}

const IDLE_LABELS = 5;
const PRICE_LABELS = 8;
const PULSE_MS = 1600;

function labelCandidates(dots: PlacedAirport[], phase: MapPhase, tripMetros: string[], currency: string): LabelCandidate[] {
  const seen = new Set<string>();
  const once = (d: PlacedAirport) => !seen.has(d.a.metro) && seen.add(d.a.metro);
  if (!showsPrices(phase)) {
    // The list arrives busiest first, so the first few metros are the cities people know.
    return dots.filter(once).map((d) => ({ id: d.a.iata, p: d.p, text: d.a.city }));
  }
  const priced = dots.filter((d) => d.a.cheapestOut !== undefined);
  const onTrip = priced.filter((d) => tripMetros.includes(d.a.metro));
  const byPrice = [...priced].sort((x, y) => (x.a.cheapestOut ?? 0) - (y.a.cheapestOut ?? 0));
  return [...onTrip, ...byPrice].filter(once).map((d) => ({
    id: d.a.iata,
    p: d.p,
    text: `${d.a.city} ${formatMoney(d.a.cheapestOut ?? 0, currency, true)}`,
  }));
}

/** Airport dots and labels in screen space, so they keep their size at every zoom. */
export function AirportDots({ dots, phase, currency, width, tripMetros, selectedMetro, onSelectMetro }: Props) {
  const extent = showsPrices(phase) ? priceExtent(dots.flatMap((d) => (d.a.cheapestOut === undefined ? [] : [d.a.cheapestOut]))) : null;
  const labels = new Map(
    placeLabels(labelCandidates(dots, phase, tripMetros, currency), showsPrices(phase) ? PRICE_LABELS : IDLE_LABELS, width).map((l) => [l.id, l.side]),
  );
  // Priced dots last, so the cheap ones are drawn on top of the unpriced rings.
  const ordered = [...dots].sort((x, y) => (y.a.cheapestOut ?? Infinity) - (x.a.cheapestOut ?? Infinity));

  return (
    <>
      {ordered.map(({ a, p }, i) => {
        const price = extent ? a.cheapestOut : undefined;
        const big = tripMetros.includes(a.metro) || selectedMetro === a.metro;
        const selected = selectedMetro === a.metro;
        const label = price === undefined ? `${a.city} (${a.iata})` : `${a.city} (${a.iata}), from ${formatMoney(price, currency)}`;
        return (
          <circle
            key={a.iata}
            cx={p[0]}
            cy={p[1]}
            r={big ? 6 : price === undefined ? 3.5 : 4.5}
            fill={price !== undefined && extent ? priceColor(price, extent.min, extent.max) : "none"}
            stroke={price !== undefined ? "var(--color-card)" : "var(--color-subtle)"}
            strokeWidth={selected ? 2.5 : 1.25}
            className={phase === "loading" ? "map-pulse" : undefined}
            style={phase === "loading" ? { animationDelay: `${Math.round((i * PULSE_MS) / ordered.length)}ms` } : undefined}
            pointerEvents="none"
          >
            <title>{label}</title>
          </circle>
        );
      })}
      {ordered.map(({ a, p }) => {
        const side = labels.get(a.iata);
        if (!side) return null;
        const price = extent ? a.cheapestOut : undefined;
        return (
          <text
            key={`label-${a.iata}`}
            x={side === "right" ? p[0] + 8 : p[0] - 8}
            y={p[1]}
            dominantBaseline="central"
            textAnchor={side === "right" ? "start" : "end"}
            className="pointer-events-none fill-text text-[12px]"
            paintOrder="stroke"
            stroke="var(--color-bg)"
            strokeWidth={3}
            strokeLinejoin="round"
          >
            {a.city}
            {price !== undefined ? <tspan className="font-medium tabular-nums"> {formatMoney(price, currency, true)}</tspan> : null}
          </text>
        );
      })}
      {extent
        ? ordered.map(({ a, p }) => {
            if (a.cheapestOut === undefined) return null;
            const selected = selectedMetro === a.metro;
            const toggle = () => onSelectMetro(selected ? null : a.metro);
            return (
              // A larger invisible hit area keeps a usable touch target without a big dot.
              <circle
                key={`hit-${a.iata}`}
                cx={p[0]}
                cy={p[1]}
                r={12}
                fill="transparent"
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={`${a.city}, from ${formatMoney(a.cheapestOut, currency)}. ${selected ? "Showing only trips via this city; press to show all" : "Show only trips via this city"}`}
                strokeWidth={1.5}
                className="cursor-pointer outline-none focus-visible:stroke-text"
                onClick={toggle}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle();
                  }
                }}
              />
            );
          })
        : null}
    </>
  );
}
