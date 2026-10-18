"use client";

import type { Combination } from "@/lib/ranking";
import type { SearchResponse } from "@/lib/server/search";
import { mapAirports, originLocation } from "../lib/map-data";
import { visibleTrips } from "../lib/results";
import type { SearchForm } from "../lib/search-form";
import type { CountryOption } from "../lib/types";
import { FareMap } from "./fare-map";
import { PriceCalendar } from "./price-calendar";
import { ResultsView } from "./results-view";

interface Props {
  response: SearchResponse;
  countries: CountryOption[];
  country: CountryOption | undefined;
  originLabel: string;
  focusedTrip: Combination | null;
  onFocusTrip: (trip: Combination | null) => void;
  selectedMetro: string | null;
  onSelectMetro: (metro: string | null) => void;
  onWiden: (patch: Partial<SearchForm>) => void;
}

/** Map and calendar on the left, the trip list on the right; one column on phones. */
export function ResultsLayout(props: Props) {
  const { response, country, focusedTrip, selectedMetro } = props;
  const req = response.request;
  const countryName = country?.name ?? req.country;
  // With no card hovered the map still draws a trip: the cheapest one the list is showing.
  const mapTrip = focusedTrip ?? visibleTrips(response.combinations, "all", "price", selectedMetro)[0] ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,58fr)_minmax(0,42fr)]">
      <div className="min-w-0 space-y-4 lg:sticky lg:top-[72px] lg:self-start">
        <div className="rounded-lg border border-rule bg-card p-3">
          <FareMap
            countryCode={req.country}
            countryName={countryName}
            airports={mapAirports(response, country?.airports ?? [])}
            origin={originLocation(response, props.countries.flatMap((c) => c.airports))}
            trip={mapTrip}
            currency={req.currency}
            selectedMetro={selectedMetro}
            onSelectMetro={props.onSelectMetro}
          />
        </div>
        {response.outboundCalendar.length > 0 ? <PriceCalendar days={response.outboundCalendar} currency={req.currency} /> : null}
      </div>
      <div className="min-w-0">
        <ResultsView
          response={response}
          countryName={countryName}
          originLabel={props.originLabel}
          selectedMetro={selectedMetro}
          onClearMetro={() => props.onSelectMetro(null)}
          onFocusTrip={props.onFocusTrip}
          onWiden={props.onWiden}        />
      </div>
    </div>
  );
}
