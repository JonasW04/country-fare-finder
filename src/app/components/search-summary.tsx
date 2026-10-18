import type { SearchResponse } from "@/lib/server/search";
import { providerLabel } from "../lib/format";

/** Provider and call count stay visible (the spec requires it); the plumbing sits behind "Search details". */
export function SearchSummary({ response: r }: { response: SearchResponse }) {
  const live = r.provider.name !== "mock";
  return (
    <div className="space-y-2">
      {r.notes.length > 0 ? (
        <div className="space-y-1 text-[13px] text-subtle">
          {r.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      ) : null}
      <p data-testid="provider-summary" className="text-xs text-subtle">
        {live ? "Live fares" : "Sample fares"} from {providerLabel(r.provider.name)} · {r.providerCalls} of {r.budget.max} requests ·{" "}
        {r.candidateAirports} airports
      </p>
      <details className="text-xs text-subtle">
        <summary className="cursor-pointer py-1">Search details</summary>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 tabular-nums">
          <dt>Price lookups planned</dt>
          <dd>{r.lookupsPlanned}</dd>
          <dt>Answered from cache</dt>
          <dd>{r.cacheHits}</dd>
          <dt>Skipped (budget or provider limit)</dt>
          <dd>{r.lookupsSkipped}</dd>
          <dt>Failed</dt>
          <dd>{r.lookupsFailed}</dd>
          <dt>Trips re-priced exactly</dt>
          <dd>{r.verifiedCombinations}</dd>
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
