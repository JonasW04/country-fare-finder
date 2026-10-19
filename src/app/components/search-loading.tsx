import type { SearchProgress } from "@/lib/server/search";
import { formatSpan } from "../lib/format";
import type { SearchForm } from "../lib/search-form";
import type { CountryOption } from "../lib/types";

const placeholder = "rounded-lg border border-rule bg-card";

const PHASE_TEXT: Record<SearchProgress["phase"], string> = {
  out: "Pricing flights out",
  in: "Pricing flights home",
  verify: "Re-checking estimated fares",
};

interface Props {
  form: SearchForm;
  country: CountryOption;
  /** The latest report of a streamed search; null until the first one arrives. */
  progress: SearchProgress | null;
  /** True once trips are listed below, so the placeholder cards give way to them. */
  compact: boolean;
}

/**
 * A progress bar and one line saying what is being priced. A live search can take a minute, so once
 * the server reports progress the bar fills by lookups done in the current phase.
 */
export function SearchLoading({ form, country, progress, compact }: Props) {
  const n = country.airportCount;
  const share = progress && progress.total > 0 ? progress.done / progress.total : null;
  return (
    <section aria-label="Searching">
      <div
        role="progressbar"
        aria-label="Searching for fares"
        aria-valuemin={share === null ? undefined : 0}
        aria-valuemax={share === null ? undefined : 100}
        aria-valuenow={share === null ? undefined : Math.round(share * 100)}
        className="h-0.5 overflow-hidden rounded-full bg-rule"
      >
        {share === null ? (
          // Reduced motion drops the animation (globals.css), so the bar shows as a faint full track.
          <div className="progress-indeterminate h-full w-1/3 bg-accent motion-reduce:w-full motion-reduce:opacity-40" />
        ) : (
          <div className="h-full bg-accent transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${Math.max(4, share * 100)}%` }} />
        )}
      </div>
      <p role="status" className="mt-3 text-sm text-subtle">
        {progress ? (
          <>
            {PHASE_TEXT[progress.phase]} ·{" "}
            <span className="tabular-nums">
              {progress.done} of {progress.total}
            </span>{" "}
            lookups{compact ? " · best trips so far below" : ""}
          </>
        ) : (
          <>
            Checking <span className="tabular-nums">{n}</span> {n === 1 ? "airport" : "airports"} in {country.name} for {formatSpan(form.earliest, form.latest)}
          </>
        )}
      </p>
      {compact ? null : (
        <div aria-hidden className="mt-4 space-y-3">
          <div className={`${placeholder} h-24`} />
          <div className={`${placeholder} h-24`} />
          <div className={`${placeholder} h-24`} />
        </div>
      )}
    </section>
  );
}
