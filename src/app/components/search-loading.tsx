import { formatSpan } from "../lib/format";
import type { SearchForm } from "../lib/search-form";
import type { CountryOption } from "../lib/types";

const placeholder = "rounded-lg border border-rule bg-card";

/** A thin indeterminate bar and one line saying what is being priced; the wait is 5-30 s. */
export function SearchLoading({ form, country }: { form: SearchForm; country: CountryOption }) {
  const n = country.airports.length;
  return (
    <section aria-label="Searching">
      <div role="progressbar" aria-label="Searching for fares" className="h-0.5 overflow-hidden rounded-full bg-rule">
        {/* Reduced motion drops the animation (globals.css), so the bar shows as a faint full track. */}
        <div className="progress-indeterminate h-full w-1/3 bg-accent motion-reduce:w-full motion-reduce:opacity-40" />
      </div>
      <p role="status" className="mt-3 text-sm text-subtle">
        Checking <span className="tabular-nums">{n}</span> {n === 1 ? "airport" : "airports"} in {country.name} for {formatSpan(form.earliest, form.latest)}
      </p>
      <div aria-hidden className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,58fr)_minmax(0,42fr)]">
        <div className={`${placeholder} aspect-[4/3]`} />
        <div className="space-y-3">
          <div className={`${placeholder} h-24`} />
          <div className={`${placeholder} h-24`} />
          <div className={`${placeholder} h-24`} />
        </div>
      </div>
    </section>
  );
}
