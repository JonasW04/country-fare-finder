import { parseSearchRequest } from "@/lib/search-request";
import { searchWithDefaults } from "@/lib/server/runtime";
import { ResultsTable } from "./results-table";
import { SearchForm } from "./search-form";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

function firstValues(params: Params): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params).flatMap(([k, v]) => {
      const value = Array.isArray(v) ? v[0] : v;
      return value === undefined ? [] : [[k, value]];
    }),
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<Params> }) {
  const values = firstValues(await searchParams);
  const submitted = "origin" in values;
  const parsed = submitted ? parseSearchRequest(values, new Date().toISOString().slice(0, 10)) : null;

  let result = null;
  let searchError: string | null = null;
  if (parsed?.ok) {
    try {
      result = await searchWithDefaults(parsed.request);
    } catch {
      searchError = "Search failed. Check the server logs.";
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-bold">Country Fare Finder</h1>
      <p className="mb-4 mt-1 text-sm text-slate-600">
        Pick a country, not cities. We price the airports inside it and rank the cheapest fly-in / fly-out pairs.
      </p>
      <SearchForm values={values} />
      {parsed && !parsed.ok ? (
        <ul role="alert" className="mt-4 list-disc rounded bg-red-100 py-2 pl-8 pr-3 text-sm text-red-900">
          {parsed.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
      {searchError ? <p role="alert" className="mt-4 rounded bg-red-100 px-3 py-2 text-sm text-red-900">{searchError}</p> : null}
      {result ? <ResultsTable result={result} /> : null}
    </main>
  );
}
