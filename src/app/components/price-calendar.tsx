"use client";

import type { DayPrice } from "@/lib/server/search";
import { dayOfMonth, formatDay, formatMoney } from "../lib/format";
import { priceColor, priceExtent } from "../lib/price-scale";

/** One cell per departure date, coloured by the cheapest fare that day. Renders nothing without data. */
export function PriceCalendar({ days, currency }: { days: DayPrice[]; currency: string }) {
  const extent = priceExtent(days.map((d) => d.price));
  if (!extent || days.length === 0) return null;
  const cheapest = days.reduce((best, d) => (d.price < best.price ? d : best));
  return (
    <section aria-labelledby="calendar-title" className="rounded-3xl bg-surface p-4 sm:p-6">
      <h2 id="calendar-title" className="font-display text-lg font-bold">
        Cheapest day to leave: {formatDay(cheapest.date)} · <span className="font-mono">{formatMoney(cheapest.price, currency)}</span>
      </h2>
      <ol className="mt-4 flex gap-1 overflow-x-auto pb-2" aria-label="Lowest outbound fare per day">
        {days.map((d) => (
          <li
            key={d.date}
            className={`flex min-w-12 flex-col items-center rounded-xl px-1 py-2 text-ink ${d === cheapest ? "ring-2 ring-fg" : ""}`}
            style={{ background: priceColor(d.price, extent.min, extent.max) }}
          >
            <span className="text-[10px] font-semibold uppercase">{formatDay(d.date).slice(0, 2)}</span>
            <span className="font-mono text-sm font-bold">{dayOfMonth(d.date)}</span>
            <span className="font-mono text-[11px]">{Math.round(d.price)}</span>
            <span className="sr-only">{`${formatDay(d.date)}: ${formatMoney(d.price, currency)}`}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
