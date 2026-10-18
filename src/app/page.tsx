import { countryAnchors, countryOptions } from "./country-options";
import { FareFinder } from "./components/fare-finder";

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
  const params = firstValues(await searchParams);
  // Server and client must agree on the default dates during hydration, so today comes from here.
  const today = new Date().toISOString().slice(0, 10);
  return <FareFinder countries={countryOptions()} anchors={countryAnchors()} initialParams={params} today={today} />;
}
