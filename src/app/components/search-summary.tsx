import type { SearchResponse } from "@/lib/server/search";
import { providerLabel } from "../lib/format";

/** Provider and call count stay visible (the spec requires it); the plumbing sits behind "Search details". */
export function SearchSummary({ response: r }: { response: SearchResponse }) {
  const live = r.provider.name !== "mock";
  return (
    <div className="space-y-3 text-sm">
      {r.notes.length > 0 ? (
        <div role="note" className="rounded-2xl bg-info px-4 py-3">
          <p className="font-semibold">ℹ︎ Good to know</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {r.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p data-testid="provider-summary" className="text-muted">
        {live ? "Live fares" : "Sample fares"} from {providerLabel(r.provider.name)} · {r.providerCalls} of {r.budget.max} requests ·{" "}
        {r.candidateAirports} airports checked
      </p>
      <details className="text-muted">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Search details</summary>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt>Price lookups planned</dt>
          <dd className="font-mono">{r.lookupsPlanned}</dd>
          <dt>Answered from cache</dt>
          <dd className="font-mono">{r.cacheHits}</dd>
          <dt>Skipped (budget or provider limit)</dt>
          <dd className="font-mono">{r.lookupsSkipped}</dd>
          <dt>Failed</dt>
          <dd className="font-mono">{r.lookupsFailed}</dd>
          <dt>Trips re-priced exactly</dt>
          <dd className="font-mono">{r.verifiedCombinations}</dd>
          {r.citiesWithoutReturn.length > 0 ? (
            <>
              <dt>Cities with no return that fit</dt>
              <dd>{r.citiesWithoutReturn.join(", ")}</dd>
            </>
          ) : null}
        </dl>
      </details>
    </div>
  );
}
