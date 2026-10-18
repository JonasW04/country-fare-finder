"use client";

import type { Offer } from "@/lib/providers/types";
import type { Combination } from "@/lib/ranking";
import { formatDay, formatMoney, nightsLabel } from "../lib/format";

interface Props {
  trip: Combination;
  cheapest: boolean;
  onFocusTrip: (trip: Combination | null) => void;
}

function LegRow({ label, direction, leg }: { label: string; direction: string; leg: Offer }) {
  const price = formatMoney(leg.price, leg.currency);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] tabular-nums">
      <span className="w-10 text-subtle">{label}</span>
      <span>
        {leg.origin}–{leg.destination}
      </span>
      <span>{formatDay(leg.date)}</span>
      <span className="text-subtle">{leg.carriers.join(", ")}</span>
      <span className="ml-auto" title={leg.estimate ? "Estimated from the fare calendar; confirm on the booking page" : undefined}>
        {leg.estimate ? "≈ " : ""}
        {price}
      </span>
      {leg.bookingUrl ? (
        <a
          href={leg.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Book ${direction} ${leg.origin} to ${leg.destination} on ${formatDay(leg.date)}`}
          className="rounded border border-rule px-2 py-0.5 text-xs hover:border-text"
        >
          Book
        </a>
      ) : null}
    </div>
  );
}

/** One ranked trip. The outline on hover or focus is the only emphasis; the map draws the same trip. */
export function TripCard({ trip, cheapest, onFocusTrip }: Props) {
  const separate = trip.outbound.requiresSelfTransfer || trip.inbound.requiresSelfTransfer;
  return (
    <li
      onMouseEnter={() => onFocusTrip(trip)}
      onMouseLeave={() => onFocusTrip(null)}
      onFocus={() => onFocusTrip(trip)}
      onBlur={(e) => {
        // Moving between the Book links inside one card is not leaving it.
        if (!e.currentTarget.contains(e.relatedTarget)) onFocusTrip(null);
      }}
      className="rounded-lg border border-rule bg-card p-4 focus-within:border-text hover:border-text"
    >
      <div className="flex items-baseline gap-2">
        <h3 className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[15px] font-semibold">
          {trip.flyIn.city} → {trip.flyOut.city}
          {trip.openJaw ? <span className="rounded border border-rule px-1.5 text-xs font-normal text-subtle">Open jaw</span> : null}
          {cheapest ? <span className="text-xs font-normal text-accent-text">Cheapest</span> : null}
        </h3>
        <span className="ml-auto text-xl font-semibold tabular-nums">{formatMoney(trip.total, trip.currency)}</span>
      </div>
      <p className="mt-1 text-[13px] text-subtle tabular-nums">
        {formatDay(trip.outbound.date)} – {formatDay(trip.inbound.date)} · {nightsLabel(trip.nights)}
      </p>
      <div className="mt-3 space-y-1.5">
        <LegRow label="Out" direction="outbound" leg={trip.outbound} />
        <LegRow label="Home" direction="return" leg={trip.inbound} />
      </div>
      {separate ? <p className="mt-2 text-xs text-warning">Separate tickets</p> : null}
    </li>
  );
}
