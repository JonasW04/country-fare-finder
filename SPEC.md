# Country Fare Finder — build spec

## Problem to solve

A traveller knows which country they want to visit but not which cities to fly into and out of. Searching city-pair by city-pair is the pain. The site takes a country and a date window, prices every reasonable arrival/departure city inside that country, and returns the cheapest combinations (open jaw: fly into city A, out of city B).

## User-facing behaviour

1. Form inputs: origin airport (IATA), optional second origin airport, destination country (ISO-2), outbound date window (earliest, latest), trip length (min, max nights), cabin, adults, currency, result count.
2. Server expands the country into candidate airports (commercial, scheduled service) from a bundled dataset.
3. For each candidate city: price `origin -> city` inside the outbound window and `city -> origin` inside the matching return window, respecting trip length.
4. Rank city pairs by total price, allowing same-city round trips and open jaws. Deduplicate airports in the same metro area (for example MXP/LIN/BGY count once).
5. Results table: rank, fly-in city, fly-out city, total price, per-leg price, dates, carriers, per-leg booking link. Show which provider produced the data and the number of provider calls used.

## Stack and shape

- Next.js (App Router) + TypeScript strict + Tailwind. One service, `npm run build` then `npm start`, must honour `$PORT`.
- No database. In-memory cache with TTL. Stateless so it deploys as a single container.
- Provider credentials only ever read in server-side code (`src/lib/server/...`). Nothing secret reaches the browser bundle.

## Provider abstraction

`src/lib/providers/types.ts` defines `FlightProvider` with `searchOffers(query): Promise<Offer[]>`.

- `mock.ts`: deterministic synthetic fares, seeded by route and date. Default. Always works with no credentials.
- `ryanair.ts` and `ignav.ts`: live providers, see `docs/provider-ryanair.md` and `docs/provider-ignav.md`. The Amadeus provider was removed because the service was shut down.

Selection by env `FLIGHT_PROVIDER=mock|ryanair|ignav`. If a keyed provider (`ignav`) is selected and its key is absent, fall back to mock and label the response as mock rather than failing the search.

## Search engine requirements

- Bounded concurrency (default 4), per-call timeout, retry with backoff on 429/5xx.
- Cache keyed by (origin, destination, date, cabin) with configurable TTL (default 20 minutes), plus cache hit counters.
- Query budget guard: `MAX_PROVIDER_CALLS` (default 60) caps provider calls per search. When the budget runs out, return partial results and say so in the response, never silently truncate.
- Combination and ranking logic lives in `src/lib/ranking.ts`, pure functions, no network or filesystem access, so it is unit-testable.
- Ranking must handle: empty results, single airport countries, missing return legs, equal prices (stable tie-break by city name), and a per-city cap on stored offers to bound memory.

## Airport dataset

`scripts/build-airports.mjs` downloads the public OurAirports CSVs (`airports.csv`, `countries.csv`) and writes `data/airports.json` for a configurable country list, keeping only airports with scheduled service and an IATA code. Commit the generated file for at least these countries: ES, IT, PT, FR, GR, TH. Keep the generator re-runnable and documented in the README.

## Tests

`npm test` runs vitest, offline only, no network:

- ranking and combination: open jaw cheaper than the round trip, metro dedupe, budget guard, empty and partial results, stable tie-break;
- mock provider determinism;
- search orchestration against a stubbed provider, including the cache hit path;
- one route-handler test for `/api/search` with the mock provider.

`npm run build` and `npm run lint` must pass.

## Deployment assets

- `Dockerfile`: multi-stage, `node:22-alpine`, `npm ci`, build, `next start`, non-root user.
- `.dockerignore`, `.env.example` (names and placeholder values only).
- `railway.json` with the start command and a healthcheck path.
- `/api/health` returns JSON with status, provider in use, app version, and whether credentials are present (boolean only, never values).
- README: local setup, env var table, test and build commands, Railway deploy steps (link the GitHub repo to a Railway project, set the env vars, and the healthcheck path), and the air-data regeneration step.

## Constraints

- Hermes owns the git remote and publishing. Do not create a repository, add a remote, or push. Commits on a local branch are fine.
- Local dev dependencies only. Nothing installed globally.
- No secret values in code, logs, or error messages. Mask credentials in any surfaced error.
- No `any` in new TypeScript. Keep files small and named for what they do.
- Currency and cabin are pass-through parameters, not hardcoded to one provider's enum values.

## Done when

- In the repo root, `npm ci`, `npm test`, `npm run lint`, and `npm run build` all pass.
- `npm start` serves the app, and a real request to `/api/search` with the mock provider returns ranked city combinations, with `/api/health` reporting the active provider.
- The results page renders the ranked table and states the provider and provider-call count.
- README documents Railway deployment with exact env var names.
- Final report lists files created, commands run, observed output, and open questions.
