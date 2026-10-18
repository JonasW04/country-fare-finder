"use client";

import { geoCentroid, geoPath } from "d3-geo";
import { useMemo } from "react";
import type { Combination } from "@/lib/ranking";
import { formatMoney } from "../lib/format";
import type { MapAirport } from "../lib/map-data";
import { bearingDeg, edgePoint, pinToFrame, roundPoint, type LatLon, type Point } from "../lib/map-geometry";
import { fitProjection } from "../lib/map-projection";
import { priceColor, priceExtent } from "../lib/price-scale";
import { useCountryShape } from "./use-country-shape";

const W = 480;
const H = 400;
const PAD = 40;
const EDGE = 10;
const LABELLED = 4;

interface Props {
  countryCode: string;
  countryName: string;
  airports: MapAirport[];
  origin: LatLon | null;
  trip: Combination | null;
  currency: string;
  selectedMetro: string | null;
  onSelectMetro: (metro: string | null) => void;
}

/** Quadratic curve between two points that bows to one side, so in and out arrows do not overlap. */
function curve(a: Point, b: Point, bow: number): string {
  const mx = (a[0] + b[0]) / 2 - (b[1] - a[1]) * bow;
  const my = (a[1] + b[1]) / 2 + (b[0] - a[0]) * bow;
  return `M ${a[0]} ${a[1]} Q ${mx} ${my} ${b[0]} ${b[1]}`;
}

export function FareMap({ countryCode, countryName, airports, origin, trip, currency, selectedMetro, onSelectMetro }: Props) {
  const shape = useCountryShape(countryCode);
  const projection = useMemo(() => fitProjection(airports, W, H, PAD, shape), [airports, shape]);
  if (!projection) return null;

  const outline = shape ? geoPath(projection)(shape) : null;
  const extent = priceExtent(airports.flatMap((a) => (a.cheapestOut === undefined ? [] : [a.cheapestOut])));
  const place = (a: LatLon): Point | null => {
    const p = projection([a.lon, a.lat]);
    return p ? roundPoint(pinToFrame(p as Point, W, H, EDGE)) : null;
  };
  const dots = airports.flatMap((a) => {
    const p = place(a);
    return p ? [{ a, p }] : [];
  });
  // Cheapest first, so the cheapest few get labels and are drawn on top.
  dots.sort((x, y) => (y.a.cheapestOut ?? Infinity) - (x.a.cheapestOut ?? Infinity));
  const labelled = new Set(dots.filter((d) => d.a.cheapestOut !== undefined).slice(-LABELLED).map((d) => d.a.iata));

  const findPoint = (iata: string, metro: string) => dots.find((d) => d.a.iata === iata)?.p ?? dots.find((d) => d.a.metro === metro)?.p ?? null;
  const flyIn = trip ? findPoint(trip.flyIn.iata, trip.flyIn.metro) : null;
  const flyOut = trip ? findPoint(trip.flyOut.iata, trip.flyOut.metro) : null;
  let arrows: { inPath: string; outPath: string } | null = null;
  if (trip && flyIn && flyOut && origin) {
    const center = projection.invert?.([W / 2, H / 2]);
    const from = center ? { lon: center[0], lat: center[1] } : (() => {
      const [lon, lat] = shape ? geoCentroid(shape) : [0, 0];
      return { lon, lat };
    })();
    const bearing = bearingDeg(from, origin);
    arrows = {
      inPath: curve(edgePoint(flyIn, bearing, W, H, EDGE), flyIn, 0.15),
      outPath: curve(flyOut, edgePoint(flyOut, bearing, W, H, EDGE), 0.15),
    };
  }

  return (
    <figure className="rounded-3xl bg-surface p-4 sm:p-6">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="font-display text-lg font-bold">{countryName}, priced</span>
        {extent ? (
          <span className="flex items-center gap-2 text-xs text-muted">
            <span className="font-mono">{formatMoney(extent.min, currency, true)}</span>
            <span aria-hidden className="h-2 w-16 rounded-full bg-gradient-to-r from-mint via-amber to-sunset" />
            <span className="font-mono">{formatMoney(extent.max, currency, true)}</span>
          </span>
        ) : null}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="group" aria-label={`Map of ${countryName} airports coloured by cheapest outbound fare`}>
        <defs>
          <marker id="arrow-in" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#FF6B3D" />
          </marker>
          <marker id="arrow-out" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#2BD4A4" />
          </marker>
        </defs>
        {outline ? <path d={outline} className="fill-ink/5 stroke-muted/60 dark:fill-white/5" strokeWidth={1} /> : null}
        {arrows ? (
          <g key={trip?.rank} fill="none" strokeWidth={3} strokeLinecap="round">
            <path d={arrows.inPath} stroke="#FF6B3D" markerEnd="url(#arrow-in)" className="trip-arrow" />
            <path d={arrows.outPath} stroke="#2BD4A4" markerEnd="url(#arrow-out)" className="trip-arrow" />
          </g>
        ) : null}
        {dots.map(({ a, p }) => {
          const priced = a.cheapestOut !== undefined && extent;
          const onTrip = trip !== null && (a.metro === trip.flyIn.metro || a.metro === trip.flyOut.metro);
          const selected = selectedMetro === a.metro;
          const label = priced ? `${a.city} (${a.iata}), from ${formatMoney(a.cheapestOut ?? 0, currency)}` : `${a.city} (${a.iata}), no fare found`;
          return (
            <g key={a.iata}>
              <circle
                cx={p[0]}
                cy={p[1]}
                r={onTrip || selected ? 9 : 6}
                fill={priced ? priceColor(a.cheapestOut ?? 0, extent.min, extent.max) : "transparent"}
                className={priced ? "stroke-ink" : "stroke-muted"}
                strokeWidth={selected ? 3 : 1.5}
              />
              {priced ? (
                // A large invisible hit area keeps the 44px touch target without bloating the dot.
                <circle
                  cx={p[0]}
                  cy={p[1]}
                  r={16}
                  fill="transparent"
                  role="button"
                  tabIndex={0}
                  aria-label={`${label}. ${selected ? "Showing only trips via this city; press to show all" : "Show only trips via this city"}`}
                  aria-pressed={selected}
                  className="cursor-pointer"
                  onClick={() => onSelectMetro(selected ? null : a.metro)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectMetro(selected ? null : a.metro);
                    }
                  }}
                >
                  <title>{label}</title>
                </circle>
              ) : (
                <title>{label}</title>
              )}
              {labelled.has(a.iata) || onTrip ? (
                <text x={p[0] + 12} y={p[1] + 4} className="fill-fg font-sans text-[13px] font-semibold" paintOrder="stroke" stroke="var(--color-surface)" strokeWidth={4}>
                  {a.city}
                  {priced ? <tspan className="font-mono"> {formatMoney(a.cheapestOut ?? 0, currency, true)}</tspan> : null}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-xs text-muted">
        {origin ? "Orange: the way in. Mint: the way home. " : ""}Tap a city to see only trips through it.
      </p>
    </figure>
  );
}
