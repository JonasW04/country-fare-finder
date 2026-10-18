"use client";

import type { Offer } from "@/lib/providers/types";
import type { Combination } from "@/lib/ranking";
import { formatDay, formatMoney, nightsLabel } from "../lib/format";
import { Confetti } from "./confetti";

interface Props {
  trip: Combination;
  originCity: string;
  active: boolean;
  celebrate: boolean;
  onActivate: () => void;
}

function LegRow({ label, leg, from, to }: { label: string; leg: Offer; from: string; to: string }) {
  const price = formatMoney(leg.price, leg.currency);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold tracking-widest text-ink/60 uppercase">{label}</p>
        <p className="font-mono text-sm">
          {from} → {to} · {formatDay(leg.date)}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {leg.carriers.map((c) => (
            <span key={c} className="rounded-md bg-ink px-1.5 py-0.5 font-mono text-xs font-semibold text-paper">
              {c}
            </span>
          ))}
          {leg.requiresSelfTransfer ? (
            <span className="rounded-md bg-amber px-2 py-0.5 text-xs font-semibold text-ink">⚠︎ Separate tickets</span>
          ) : null}
        </div>
      </div>
      {leg.estimate ? (
        <span title="Fare-calendar low; confirm on the booking page" className="cursor-help font-mono text-lg font-semibold underline decoration-dotted">
          ≈ {price}
          <span className="sr-only"> (fare-calendar low; confirm on the booking page)</span>
        </span>
      ) : (
        <span className="font-mono text-lg font-semibold">{price}</span>
      )}
      {leg.bookingUrl ? (
        <a
          href={leg.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center rounded-xl border-2 border-ink px-4 text-sm font-bold text-ink hover:bg-ink hover:text-paper"
        >
          Book {label.toLowerCase()} ↗<span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : null}
    </div>
  );
}

/** One ranked trip, styled as a boarding pass. Paper in both colour schemes: it is the "ticket". */
export function BoardingPass({ trip, originCity, active, celebrate, onActivate }: Props) {
  const back = trip.inbound.destination;
  return (
    <li
      onMouseEnter={onActivate}
      onFocusCapture={onActivate}
      className={`relative flex overflow-visible rounded-3xl bg-paper text-ink shadow-md transition-shadow ${active ? "ring-4 ring-sunset/70" : ""}`}
    >
      {celebrate ? <Confetti /> : null}
      <div className="flex w-12 shrink-0 flex-col items-center justify-center rounded-l-3xl bg-ink text-paper sm:w-16">
        <span className="text-[10px] tracking-widest uppercase opacity-70">No.</span>
        <span className="font-mono text-2xl font-bold">{trip.rank}</span>
      </div>
      <article aria-label={`Trip ${trip.rank}: into ${trip.flyIn.city}, out of ${trip.flyOut.city}, ${formatMoney(trip.total, trip.currency)}`} className="min-w-0 flex-1 p-4 sm:p-6">
        <button type="button" onClick={onActivate} className="block w-full text-left" aria-pressed={active}>
          <span className="flex flex-wrap items-baseline gap-x-3 font-mono text-xl font-bold sm:text-2xl">
            <span>
              {trip.origin} → {trip.flyIn.iata}
            </span>
            <span>
              <span className="text-ink/40">···</span> {trip.flyOut.iata} → {back}
            </span>
          </span>
          <span className="mt-1 block text-sm text-ink/70">
            {originCity} → {trip.flyIn.city} · {trip.flyOut.city} → {originCity}
          </span>
          <span className="mt-1 block text-sm font-semibold">
            {formatDay(trip.outbound.date)} → {formatDay(trip.inbound.date)} · {nightsLabel(trip.nights)}
          </span>
        </button>
        {trip.openJaw ? (
          <span aria-label="Open jaw" className="stamp pointer-events-none absolute right-4 top-4 rounded-md border-[3px] border-mint-ink px-2 py-0.5 font-mono text-sm font-bold tracking-widest text-mint-ink sm:right-6">
            OPEN JAW
          </span>
        ) : null}
        <div aria-hidden className="perforation -mx-4 my-4 sm:-mx-6" />
        <div className="space-y-4">
          <LegRow label="Outbound" leg={trip.outbound} from={trip.outbound.origin} to={trip.outbound.destination} />
          <LegRow label="Return" leg={trip.inbound} from={trip.inbound.origin} to={trip.inbound.destination} />
        </div>
        <p className="mt-4 flex items-baseline justify-between border-t-2 border-dashed border-ink/20 pt-3">
          <span className="text-sm font-semibold tracking-widest text-ink/60 uppercase">Total</span>
          <span className="font-mono text-3xl font-bold">{formatMoney(trip.total, trip.currency)}</span>
        </p>
      </article>
    </li>
  );
}
