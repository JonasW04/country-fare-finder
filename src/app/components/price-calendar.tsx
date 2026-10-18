import type { DayPrice } from "@/lib/server/search";
import { dayOfMonth, formatDay, formatMoney, weekdayLetter } from "../lib/format";
import { priceExtent, priceTercile } from "../lib/price-scale";

/** One compact row, one cell per departure date. Renders nothing without data. */
export function PriceCalendar({ days, currency }: { days: DayPrice[]; currency: string }) {
  const extent = priceExtent(days.map((d) => d.price));
  if (!extent || days.length === 0) return null;
  const cheapest = days.reduce((best, d) => (d.price < best.price ? d : best));
  return (
    <section aria-label="Lowest outbound fare per day">
      <ol className="flex gap-1 overflow-x-auto pb-1">
        {days.map((d) => (
          <li
            key={d.date}
            className={`flex min-w-12 flex-col items-center rounded-lg px-1 py-1.5 text-xs tabular-nums ${priceTercile(d.price, extent.min, extent.max) === 0 ? "bg-land" : ""}`}
          >
            <span className="text-subtle">{weekdayLetter(d.date)}</span>
            <span>{dayOfMonth(d.date)}</span>
            <span className={d === cheapest ? "font-bold text-accent-text" : ""}>{Math.round(d.price)}</span>
            <span className="sr-only">{`${formatDay(d.date)}: ${formatMoney(d.price, currency)}`}</span>
          </li>
        ))}
      </ol>
      <p className="mt-1 text-xs text-subtle tabular-nums">
        Cheapest day to leave: {formatDay(cheapest.date)}, {formatMoney(cheapest.price, currency)}
      </p>
    </section>
  );
}
