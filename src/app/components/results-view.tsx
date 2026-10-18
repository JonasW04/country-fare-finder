"use client";

import { useState } from "react";
import { addDays, nightsBetween } from "@/lib/dates";
import type { SearchResponse } from "@/lib/server/search";
import { formatMoney } from "../lib/format";
import { mapAirports, originLocation } from "../lib/map-data";
import { GREAT_DEAL_TOTAL, openJawSaving, visibleTrips, type TripFilter, type TripSort } from "../lib/results";
import type { SearchForm } from "../lib/search-form";
import type { CountryOption } from "../lib/types";
import { BoardingPass } from "./boarding-pass";
import { FareMap } from "./fare-map";
import { PriceCalendar } from "./price-calendar";
import { SearchSummary } from "./search-summary";

interface Props {
  response: SearchResponse;
  country: CountryOption | undefined;
  countries: CountryOption[];
  originLabel: string;
  onWiden: (patch: Partial<SearchForm>) => void;
}

const FILTERS: { id: TripFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open-jaw", label: "Open jaw" },
  { id: "same-city", label: "Same city" },
];

const chip = (on: boolean) =>
  `min-h-11 rounded-full border-2 px-4 text-sm font-semibold ${on ? "border-fg bg-fg text-canvas" : "border-line hover:border-fg"}`;

export function ResultsView({ response, country, countries, originLabel, onWiden }: Props) {
  const [filter, setFilter] = useState<TripFilter>("all");
  const [sort, setSort] = useState<TripSort>("price");
  const [metro, setMetro] = useState<string | null>(null);
  const [activeRank, setActiveRank] = useState<number | null>(null);

  const req = response.request;
  const all = response.combinations;
  const trips = visibleTrips(all, filter, sort, metro);
  const saving = openJawSaving(all);
  const active = all.find((c) => c.rank === activeRank) ?? trips[0] ?? null;
  const countryName = country?.name ?? req.country;
  const originCity = response.origins[0]?.city ?? (originLabel.includes("·") ? (originLabel.split("·")[0] ?? "").trim() : req.origin);
  const known = countries.flatMap((c) => c.airports);
  const airports = mapAirports(response, country?.airports ?? []);
  const metroName = metro ? (airports.find((a) => a.metro === metro)?.city ?? metro) : null;

  if (all.length === 0) {
    // Widening by a week stays inside the API's 31-day outbound window.
    const widerLatest = addDays(req.latest, Math.min(7, 30 - nightsBetween(req.earliest, req.latest)));
    return (
      <section aria-labelledby="empty-title" className="mx-auto mt-12 max-w-xl rounded-3xl bg-surface p-8 text-center">
        <p aria-hidden className="text-5xl">🧳</p>
        <h2 id="empty-title" className="mt-4 font-display text-2xl font-bold">
          No fly-in / fly-out pair fit those dates.
        </h2>
        <p className="mt-2 text-muted">
          Flights from {req.origin} to {countryName} may be sparse in that window. Widen the dates or the trip length, or try a bigger airport nearby as your origin.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {widerLatest > req.latest ? (
            <button type="button" onClick={() => onWiden({ latest: widerLatest })} className="min-h-12 rounded-2xl bg-sunset px-5 font-bold text-ink">
              Widen the window by a week
            </button>
          ) : null}
          <button type="button" onClick={() => onWiden({ minNights: 2, maxNights: 14 })} className="min-h-12 rounded-2xl border-2 border-line px-5 font-bold">
            Allow 2–14 nights
          </button>
        </div>
        <div className="mt-8 text-left">
          <SearchSummary response={response} />
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="results-title" className="mt-10">
      <h2 id="results-title" className="font-display text-3xl font-extrabold">
        {all.length} ways into {countryName}
      </h2>
      <p role="status" className="sr-only">
        Found {all.length} trips. Cheapest is {formatMoney(all[0]?.total ?? 0, req.currency)}.
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="space-y-6 lg:sticky lg:top-4 lg:self-start">
          <FareMap
            countryCode={req.country}
            countryName={countryName}
            airports={airports}
            origin={originLocation(response, known)}
            trip={active}
            currency={req.currency}
            selectedMetro={metro}
            onSelectMetro={setMetro}
          />
          <PriceCalendar days={response.outboundCalendar} currency={req.currency} />
        </div>
        <div className="min-w-0 space-y-4">
          {saving ? (
            <p className="rounded-2xl border-2 border-mint bg-mint/15 px-4 py-3 font-semibold">
              <span aria-hidden>💸 </span>
              Flying into {saving.openJaw.flyIn.city} and out of {saving.openJaw.flyOut.city} saves{" "}
              <span className="font-mono text-mint-ink">{formatMoney(saving.amount, req.currency, true)}</span> vs the best round trip
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="Show trips" className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={chip(filter === f.id)}>
                  {f.label}
                </button>
              ))}
              {metroName ? (
                <button type="button" onClick={() => setMetro(null)} className={chip(true)} aria-label={`Showing trips via ${metroName}. Show all cities`}>
                  Via {metroName} ✕
                </button>
              ) : null}
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold">
              Sort by
              <select value={sort} onChange={(e) => setSort(e.target.value === "nights" ? "nights" : "price")} className="min-h-11 rounded-xl border-2 border-line bg-surface px-3">
                <option value="price">Price</option>
                <option value="nights">Nights</option>
              </select>
            </label>
          </div>
          {trips.length === 0 ? (
            <p className="rounded-2xl bg-surface px-4 py-6 text-center text-muted">No trips match these filters. Try “All”.</p>
          ) : (
            <ol className="space-y-6">
              {trips.map((trip, i) => (
                <BoardingPass
                  key={trip.rank}
                  trip={trip}
                  originCity={originCity}
                  active={active?.rank === trip.rank}
                  celebrate={i === 0 && trip.rank === 1 && trip.total < GREAT_DEAL_TOTAL}
                  onActivate={() => setActiveRank(trip.rank)}
                />
              ))}
            </ol>
          )}
          <SearchSummary response={response} />
        </div>
      </div>
    </section>
  );
}
