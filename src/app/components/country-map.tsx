"use client";

import { geoEqualEarth, geoPath } from "d3-geo";
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Combination } from "@/lib/ranking";
import type { SearchSnapshot } from "@/lib/server/search";
import { mapAirports, originLocation, type MapAirport } from "../lib/map-data";
import { insideFrame, pinToFrame, roundPoint, type Point } from "../lib/map-geometry";
import { REGIONS } from "../lib/map-regions";
import { airportBox, applyTransform, fitTransform, pointBox, projectBox, type Bounds } from "../lib/map-view";
import type { CountryAnchors, CountryOption } from "../lib/types";
import { AirportDots, type MapPhase, type PlacedAirport } from "./airport-dots";
import { MapToolbar } from "./map-toolbar";
import { SmallCountryDots, type SmallCountry } from "./small-country-dots";
import { TripLines } from "./trip-lines";
import { useCountryAirports } from "./use-country-airports";
import { useCountryShape } from "./use-country-shape";
import { useElementSize } from "./use-element-size";
import { useHeldTransform, useMapView } from "./use-map-view";
import { useWorld } from "./use-world";
import { airportsText, WorldLayer } from "./world-layer";

// The world is projected once into this box; zooming and fitting the card are one CSS transform.
const REF_W = 1000;
const REF_H = 500;
const EDGE = 10;
const COUNTRY_PAD = 36;
const WORLD_PAD = 8;

interface Props {
  countries: CountryOption[];
  anchors: CountryAnchors;
  /** The chosen country: the search bar's value. */
  country: string;
  onPickCountry: (code: string) => void;
  phase: MapPhase;
  /** The final response, or the latest preview while a search streams. */
  response: SearchSnapshot | null;
  trip: Combination | null;
  selectedMetro: string | null;
  onSelectMetro: (metro: string | null) => void;
  /** Height classes for the map frame; the layout decides. */
  frameClass: string;
}

const codeAt = (target: EventTarget) => (target instanceof Element ? target.getAttribute("data-code") : null);

/** The world map that picks the country, then zooms in on it and shows its airports and prices. */
export function CountryMap(props: Props) {
  const { countries, anchors, country, phase, response, trip } = props;
  const frame = useRef<HTMLDivElement>(null);
  const size = useElementSize(frame);
  const world = useWorld();
  const airports = useCountryAirports(country);
  const shape = useCountryShape(country);
  const [view, setView] = useMapView(country, phase !== "idle");
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);
  const byCode = useMemo(() => new Map(countries.map((c) => [c.code, c])), [countries]);

  const geo = useMemo(() => {
    if (!world) return null;
    const projection = geoEqualEarth().fitExtent([[0, 0], [REF_W, REF_H]], world);
    const path = geoPath(projection).digits(2);
    const features = world.features.map((f) => ({ code: f.properties.iso2, d: path(f) ?? "", feature: f }));
    const byIso = new Map(features.flatMap((f) => (f.code ? [[f.code, f] as const] : [])));
    // The 50m outline is drawn at country zoom, where two decimals of the 1000-wide world would show steps.
    return { projection, path, finePath: geoPath(projection).digits(3), features, byIso, bounds: path.bounds(world) as Bounds };
  }, [world]);

  const W = size?.width ?? 0;
  const H = size?.height ?? 0;
  let bounds: Bounds | null = null;
  let pad = WORLD_PAD;
  if (geo) {
    const project = (ll: [number, number]) => geo.projection(ll) as Point | null;
    if (view.kind === "world") bounds = geo.bounds;
    else if (view.kind === "region") {
      const box = REGIONS.find((r) => r.id === view.id)?.box;
      bounds = box ? projectBox(project, box) : geo.bounds;
    } else if (airports) {
      pad = COUNTRY_PAD;
      const box = airportBox(airports);
      const outline = geo.byIso.get(country)?.feature;
      const anchor = anchors[country];
      if (box) bounds = projectBox(project, box);
      else if (outline) bounds = geo.path.bounds(outline) as Bounds;
      else bounds = anchor ? projectBox(project, pointBox(anchor[0], anchor[1])) : geo.bounds;
    }
  }
  const t = useHeldTransform(bounds && W > 0 && H > 0 ? fitTransform(bounds, W, H, Math.min(pad, W / 10)) : null);

  const toScreen = (lon: number, lat: number): Point | null => {
    const p = geo?.projection([lon, lat]);
    return p && t ? applyTransform(t, [p[0], p[1]]) : null;
  };

  const zoomed = view.kind === "country";
  const small: SmallCountry[] = countries.flatMap((option) => {
    if (geo?.byIso.has(option.code) || (zoomed && option.code === country)) return [];
    const anchor = anchors[option.code];
    const p = anchor ? toScreen(anchor[0], anchor[1]) : null;
    return p && insideFrame(p, W, H, 0) ? [{ option, p: roundPoint(p) }] : [];
  });

  const priced = phase === "done" || phase === "partial";
  const list: MapAirport[] = priced && response ? mapAirports(response, airports ?? []) : (airports ?? []);
  const dots: PlacedAirport[] = zoomed
    ? list.flatMap((a) => {
        const p = toScreen(a.lon, a.lat);
        return p ? [{ a, p: roundPoint(pinToFrame(p, W, H, EDGE)) }] : [];
      })
    : [];
  const findDot = (iata: string, metro: string) => dots.find((d) => d.a.iata === iata)?.p ?? dots.find((d) => d.a.metro === metro)?.p ?? null;
  const origin = priced && response ? originLocation(response, airports ?? []) : null;
  const originPoint = origin ? toScreen(origin.lon, origin.lat) : null;
  const flyIn = trip ? findDot(trip.flyIn.iata, trip.flyIn.metro) : null;
  const flyOut = trip ? findDot(trip.flyOut.iata, trip.flyOut.metro) : null;

  const outline = geo?.byIso.get(country)?.d;
  const selectedD = zoomed && shape && geo ? (geo.finePath(shape) ?? outline) : outline;
  const hoverD = hover ? geo?.byIso.get(hover.code)?.d : undefined;
  const tabCode = geo?.byIso.has(country) ? country : (geo?.features.find((f) => f.code && byCode.has(f.code))?.code ?? null);
  const hovered = hover ? byCode.get(hover.code) : undefined;

  function pick(code: string) {
    setView({ kind: "country" });
    props.onPickCountry(code);
  }
  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const code = codeAt(e.target);
    const box = frame.current?.getBoundingClientRect();
    setHover(code && byCode.has(code) && box ? { code, x: e.clientX - box.left, y: e.clientY - box.top } : null);
  }
  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    const code = codeAt(e.target);
    if ((e.key === "Enter" || e.key === " ") && code && byCode.has(code)) {
      e.preventDefault();
      pick(code);
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-rule bg-card">
      <MapToolbar view={view} onView={setView} />
      <div ref={frame} className={`relative bg-bg ${props.frameClass}`}>
        {geo && t ? (
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            className="absolute inset-0 block"
            role="group"
            aria-label="World map for choosing a country; the Country field in the search bar does the same by keyboard"
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHover(null)}
            onClick={(e) => {
              const code = codeAt(e.target);
              if (code && byCode.has(code)) pick(code);
            }}
            onKeyDown={onKeyDown}
          >
            <g style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})`, transformOrigin: "0 0", transition: "transform 600ms ease-in-out" }}>
              <WorldLayer features={geo.features} byCode={byCode} tabCode={tabCode} />
              {selectedD ? (
                <path
                  d={selectedD}
                  pointerEvents="none"
                  // Zoomed in, a light tint keeps the cheapest-third dots (accent) readable on top.
                  className={zoomed ? "fill-accent/15 stroke-accent" : "fill-accent/70 stroke-bg"}
                  strokeWidth={zoomed ? 1 : 0.5}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {hoverD && hover?.code !== country ? <path d={hoverD} pointerEvents="none" className="fill-accent/35" /> : null}
            </g>
            {/* Screen-space layer, keyed on the frame so it fades in once the land has finished moving. */}
            <g key={`${Math.round(t.k * 1000)}:${Math.round(t.x)}:${Math.round(t.y)}`} className="map-overlay">
              <SmallCountryDots dots={small} hovered={hover?.code ?? null} selected={country} />
              {trip && flyIn && flyOut && originPoint ? <TripLines key={trip.rank} flyIn={flyIn} flyOut={flyOut} origin={originPoint} width={W} height={H} /> : null}
              <AirportDots
                dots={dots}
                phase={phase}
                currency={response?.request.currency ?? "EUR"}
                width={W}
                tripMetros={trip ? [trip.flyIn.metro, trip.flyOut.metro] : []}
                selectedMetro={props.selectedMetro}
                onSelectMetro={props.onSelectMetro}
              />
            </g>
          </svg>
        ) : null}
        {hover && hovered ? (
          <div
            aria-hidden
            className="pointer-events-none absolute z-10 rounded-md border border-rule bg-card px-2 py-1 text-xs whitespace-nowrap text-text"
            style={hover.x > W - 180 ? { right: W - hover.x + 12, top: hover.y + 14 } : { left: hover.x + 12, top: hover.y + 14 }}
          >
            {hovered.name} · {airportsText(hovered.airportCount)}
          </div>
        ) : null}
      </div>
      {phase === "done" && zoomed ? (
        <p className="border-t border-rule px-3 py-2 text-xs text-subtle">Filled orange dots are the cheapest third. Click a city to see only trips through it.</p>
      ) : null}
    </div>
  );
}
