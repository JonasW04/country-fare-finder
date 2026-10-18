"use client";

import { geoPath } from "d3-geo";
import { useEffect, useMemo, useState } from "react";
import { formatSpan } from "../lib/format";
import { pinToFrame, roundPoint, type Point } from "../lib/map-geometry";
import { fitProjection } from "../lib/map-projection";
import type { SearchForm } from "../lib/search-form";
import type { CountryOption } from "../lib/types";
import { useCountryShape } from "./use-country-shape";
import { useReducedMotion } from "./use-reduced-motion";

const W = 480;
const H = 360;
const PAD = 36;

/** What the search is really doing, a line at a time, so the 5-15 s wait reads as work rather than a hang. */
function progressLines(form: SearchForm, country: CountryOption): string[] {
  const n = country.airports.length;
  return [
    `Asking ${n} airports in ${country.name} for their best price…`,
    `Checking every day from ${formatSpan(form.earliest, form.latest)}…`,
    `Pairing fly-in and fly-out cities for ${form.minNights}–${form.maxNights} nights…`,
    `Looking for open-jaw trips: in one city, out another…`,
    `Ranking the cheapest combinations…`,
  ];
}

export function SearchLoading({ form, country }: { form: SearchForm; country: CountryOption }) {
  const reduced = useReducedMotion();
  const shape = useCountryShape(country.code);
  const lines = progressLines(form, country);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => setTick((t) => t + 1), 2400);
    return () => clearInterval(timer);
  }, [reduced]);

  const projection = useMemo(() => fitProjection(country.airports, W, H, PAD, shape), [country.airports, shape]);
  const outline = projection && shape ? geoPath(projection)(shape) : null;
  const dots = projection
    ? country.airports.flatMap((a) => {
        const p = projection([a.lon, a.lat]);
        return p ? [roundPoint(pinToFrame(p as Point, W, H, 12))] : [];
      })
    : [];
  const stagger = Math.min(180, 4000 / Math.max(1, dots.length));

  return (
    <section aria-labelledby="loading-title" className="mx-auto max-w-3xl px-4 py-12 text-center">
      <h2 id="loading-title" className="sr-only">
        Searching
      </h2>
      <p role="status" aria-live="polite" className="sr-only">
        Searching {country.airports.length} airports in {country.name}. This takes up to 15 seconds.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full max-w-md" aria-hidden>
        {outline ? <path d={outline} className="fill-ink-2/10 stroke-muted/50 dark:fill-white/5" strokeWidth={1} /> : null}
        <path id="flight-arc" d={`M ${PAD} ${H - PAD} Q ${W / 2} ${-H / 4} ${W - PAD} ${H - PAD * 2}`} fill="none" className="stroke-sunset/60" strokeWidth={2} strokeDasharray="6 8" />
        {dots.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={4} className="airport-dot fill-mint stroke-ink/40" strokeWidth={1} style={{ animationDelay: `${Math.round(i * stagger)}ms` }} />
        ))}
        {reduced ? (
          <text x={W - PAD} y={H - PAD * 2} fontSize={28} textAnchor="middle">
            ✈️
          </text>
        ) : (
          <text fontSize={28} textAnchor="middle" dominantBaseline="middle">
            ✈️
            <animateMotion dur="4s" repeatCount="indefinite" rotate="auto" path={`M ${PAD} ${H - PAD} Q ${W / 2} ${-H / 4} ${W - PAD} ${H - PAD * 2}`} />
          </text>
        )}
      </svg>
      <p key={tick} className="fade-line mt-6 min-h-14 font-display text-xl font-semibold sm:text-2xl" aria-hidden>
        {lines[tick % lines.length]}
      </p>
    </section>
  );
}
