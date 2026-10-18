import type { Combination } from "@/lib/ranking";
import type { SearchResponse } from "@/lib/server/search";

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function Leg({ leg }: { leg: Combination["outbound"] }) {
  return (
    <div>
      <div>
        {leg.origin} → {leg.destination}: {money(leg.price, leg.currency)}
      </div>
      <div className="text-xs text-slate-500">
        {leg.date} · {leg.carriers.join(", ") || "n/a"}
        {leg.bookingUrl ? (
          <>
            {" · "}
            <a href={leg.bookingUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
              Book leg
            </a>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function ResultsTable({ result }: { result: SearchResponse }) {
  return (
    <section className="mt-6" aria-label="Search results">
      <p className="text-sm text-slate-700" data-testid="provider-summary">
        Provider: <strong>{result.provider.name}</strong> · Provider calls used:{" "}
        <strong>
          {result.providerCalls} / {result.budget.max}
        </strong>{" "}
        · Cache hits: {result.cacheHits} · Airports priced: {result.candidateAirports}
      </p>
      {result.notes.map((note) => (
        <p key={note} role="status" className="mt-2 rounded bg-amber-100 px-3 py-2 text-sm text-amber-900">
          {note}
        </p>
      ))}
      {result.combinations.length > 0 ? (
        <div className="mt-3 overflow-x-auto rounded-lg bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Fly in</th>
                <th className="px-3 py-2">Fly out</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Outbound leg</th>
                <th className="px-3 py-2">Return leg</th>
                <th className="px-3 py-2">Nights</th>
              </tr>
            </thead>
            <tbody>
              {result.combinations.map((c) => (
                <tr key={c.rank} className="border-t border-slate-200 align-top">
                  <td className="px-3 py-2 font-semibold">{c.rank}</td>
                  <td className="px-3 py-2">{c.flyIn.city}</td>
                  <td className="px-3 py-2">
                    {c.flyOut.city}
                    {c.openJaw ? <span className="ml-1 rounded bg-emerald-100 px-1 text-xs text-emerald-800">open jaw</span> : null}
                  </td>
                  <td className="px-3 py-2 font-semibold">{money(c.total, c.currency)}</td>
                  <td className="px-3 py-2">
                    <Leg leg={c.outbound} />
                  </td>
                  <td className="px-3 py-2">
                    <Leg leg={c.inbound} />
                  </td>
                  <td className="px-3 py-2">{c.nights}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
