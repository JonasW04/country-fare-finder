"use client";

import { useState } from "react";
import { addDays, nightsBetween } from "@/lib/dates";
import type { Combination } from "@/lib/ranking";
import type { SearchResponse } from "@/lib/server/search";
import { formatMoney } from "../lib/format";
import { openJawSaving, visibleTrips, type TripFilter, type TripSort } from "../lib/results";
import type { SearchForm } from "../lib/search-form";
import { SearchSummary } from "./search-summary";
import { TripCard } from "./trip-card";

interface Props {
  response: SearchResponse;
  countryName: string;
  originLabel: string;
  selectedMetro: string | null;
  onClearMetro: () => void;
  onFocusTrip: (trip: Combination | null) => void;
  onWiden: (patch: Partial<SearchForm>) => void;
}

const FILTERS: { id: TripFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open-jaw", label: "Open jaw" },
  { id: "same-city", label: "Same city" },
];

const SORTS: { id: TripSort; label: string }[] = [
  { id: "price", label: "Price" },
  { id: "nights", label: "Nights" },
];

const segment = (on: boolean) =>
  `rounded-md px-2.5 py-1 text-sm ${on ? "bg-text text-card" : "text-subtle hover:text-text"}`;

function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex gap-0.5 rounded-lg border border-rule p-0.5">
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)} className={segment(value === o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ResultsView({ response, countryName, selectedMetro, onClearMetro, onFocusTrip, onWiden }: Props) {
  const [filter, setFilter] = useState<TripFilter>("all");
  const [sort, setSort] = useState<TripSort>("price");

  const req = response.request;
  const all = response.combinations;

  if (all.length === 0) {
    // Widening by a week stays inside the API's 31-day outbound window.
    const widerLatest = addDays(req.latest, Math.min(7, 30 - nightsBetween(req.earliest, req.latest)));
    return (
      <section aria-labelledby="empty-title" className="space-y-4">
        <h2 id="empty-title" className="text-lg font-semibold">
          No trips matched those dates and nights.
        </h2>
        <div className="flex flex-wrap gap-2">
          {widerLatest > req.latest ? (
            <button type="button" onClick={() => onWiden({ latest: widerLatest })} className="rounded-lg border border-rule px-3 py-1.5 text-sm hover:border-text">
              Widen by a week
            </button>
          ) : null}
          <button type="button" onClick={() => onWiden({ minNights: 2, maxNights: 14 })} className="rounded-lg border border-rule px-3 py-1.5 text-sm hover:border-text">
            Allow 2–14 nights
          </button>
        </div>
        <SearchSummary response={response} />
      </section>
    );
  }

  const trips = visibleTrips(all, filter, sort, selectedMetro);
  const saving = openJawSaving(all);
  const cheapestTotal = all[0]?.total ?? 0;
  const metroName = selectedMetro
    ? (all.flatMap((c) => [c.flyIn, c.flyOut]).find((a) => a.metro === selectedMetro)?.city ?? selectedMetro)
    : null;

  return (
    <section aria-labelledby="results-title" className="space-y-4">
      <div>
        <h2 id="results-title" className="flex flex-wrap items-baseline gap-x-3 text-lg font-semibold">
          {all.length} {all.length === 1 ? "trip" : "trips"} into {countryName}
          <span className="text-sm font-normal text-subtle tabular-nums">Cheapest {formatMoney(cheapestTotal, req.currency)}</span>
        </h2>
        {saving ? (
          <p className="mt-1 text-sm text-subtle tabular-nums">
            Into {saving.openJaw.flyIn.city}, home from {saving.openJaw.flyOut.city} saves {formatMoney(saving.amount, req.currency, true)} over the best round trip
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented label="Show trips" options={FILTERS} value={filter} onChange={setFilter} />
        <div className="flex items-center gap-2 text-sm text-subtle">
          Sort
          <Segmented label="Sort trips by" options={SORTS} value={sort} onChange={setSort} />
        </div>
      </div>
      {metroName ? (
        <p className="text-sm text-subtle">
          Showing trips through {metroName} ·{" "}
          <button type="button" onClick={onClearMetro} className="text-text underline">
            Show all
          </button>
        </p>
      ) : null}
      {trips.length === 0 ? (
        <p className="text-sm text-subtle">No trips match these filters.</p>
      ) : (
        <ol className="space-y-2">
          {trips.map((trip) => (
            <TripCard key={trip.rank} trip={trip} cheapest={trip.rank === 1} onFocusTrip={onFocusTrip} />
          ))}
        </ol>
      )}
      <SearchSummary response={response} />
    </section>
  );
}
