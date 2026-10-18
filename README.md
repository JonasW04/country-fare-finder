# country-fare-finder

You know the country, not the cities. Enter an origin airport, a destination country and a date window; the app prices the airports inside that country and returns the cheapest fly-in / fly-out city combinations (open jaw included).

`SPEC.md` is the build contract.

## Local setup

Requires Node 22+.

```bash
npm ci
cp .env.example .env.local   # optional; the default provider is the offline mock
npm run dev                  # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | dev server |
| `npm test` | vitest, offline, no network |
| `npm run lint` | eslint |
| `npm run build` | production build |
| `npm start` | serve the build on `$PORT` (default 3000) |
| `node scripts/build-airports.mjs` | regenerate `data/airports.json` |

The UI lives at `/`. The JSON API is `GET /api/search?origin=LHR&country=IT&earliest=2027-03-01&latest=2027-03-05&minNights=5&maxNights=7` (or `POST` the same fields as JSON). `GET /api/health` reports status, provider, version and whether credentials are present (a boolean, never the values).

## Environment variables

| Name | Default | Purpose |
| --- | --- | --- |
| `FLIGHT_PROVIDER` | `mock` | `mock`, `ryanair` or `ignav`. `ryanair` needs no key. If `ignav` is chosen without `IGNAV_API_KEY` the app falls back to mock and labels the response. |
| `IGNAV_API_KEY` | none | Ignav API key, sent as `X-Api-Key`. Server side only; set it in the environment, never in code or a committed file. |
| `MAX_PROVIDER_CALLS` | `60` (`90` for `ryanair`) | Provider requests allowed per search, retries included. When it runs out the response is marked partial. |
| `CACHE_TTL_SECONDS` | `1200` | Lifetime of cached route/date fares. |
| `SEARCH_CONCURRENCY` | `4` (`2` for `ryanair`) | Parallel provider calls. |
| `PROVIDER_TIMEOUT_MS` | `10000` | Per-call timeout. |
| `PROVIDER_RETRIES` | `2` | Retries on 429/5xx/timeout, with exponential backoff. |
| `PROVIDER_BACKOFF_MS` | `400` | Base backoff delay. |
| `MAX_DATES_PER_LEG` | `3` | Outbound dates sampled per search, or window chunks for `ryanair`. Ignored by per-day fare calendars. |
| `MAX_AIRPORTS_PER_COUNTRY` | unlimited (`12` for `ignav`, `15` for `mock`) | Prices only the largest airports of the country, one per metro. |
| `VERIFY_TOP` | `0` (`5` for `ignav`) | Top combinations whose fare-calendar estimates are re-checked with an exact search. `0` turns the re-check off. |
| `PORT` | `3000` | Set by Railway; `npm start` honours it. |

## Live fares with Ryanair (no key)

Set `FLIGHT_PROVIDER=ryanair` to price real Ryanair fares from its public fare-finder endpoint (`services-api.ryanair.com/farfnd/v4/oneWayFares`). It needs no credentials and `/api/health` reports `credentialsPresent: false`. With this provider `MAX_PROVIDER_CALLS` counts real HTTP requests. The outbound window is split into `MAX_DATES_PER_LEG` (3) chunks, each one country-wide request shared by every airport. The return window (earliest + min nights to latest + max nights) is also split into 3 chunks, but only airports of cities that got an outbound fare are asked, one request per chunk. A search where 25 Italian airports are served costs about 3 + 25 x 3 = 78 requests, inside the default budget of 90. `providerCalls` reports those requests, while `lookupsPlanned` and `lookupsSkipped` still count logical lookups. Only Ryanair routes are covered, and the endpoint is undocumented, so it can change or throttle without notice. HTTP 429, HTTP 403, empty results and an unexpected response shape are reported as partial results with a note; no fare is ever invented. `mock` remains the default.

## Live fares with Ignav (all carriers, API key)

Set `FLIGHT_PROVIDER=ignav` and provide `IGNAV_API_KEY` in the environment. Ignav covers all carriers, so it works for markets Ryanair barely serves (such as Norway). `/api/health` reports `credentialsPresent` as a boolean only. Without a key the app falls back to mock and labels the response.

Ignav bills every successful request after a one-time allowance of 1,000 free requests ($2.00 per 1,000 after that), so the defaults keep a search small: the 12 largest airports of the country (one per metro, `MAX_AIRPORTS_PER_COUNTRY`). Each airport costs one outbound fare-calendar request (one request prices up to 31 days) plus ceil(returnWindowDays / 31) return calendar requests, and returns are only asked for airports with an outbound fare. A 7-day window with 5-10 nights has a 12-day return window, so 12 airports cost about **24 calendar requests**, plus exact re-checks of the legs in the top 5 combinations (`VERIFY_TOP`): usually 10 requests, never more than 4 x `VERIFY_TOP`. A second origin doubles the calendar requests; the Ignav default budget of 100 calls (`MAX_PROVIDER_CALLS`) covers two origins over a full 31-day window.

Calendar prices are the lowest observed quote per day and carry no flight details, so the top combinations are re-priced with an exact one-way search, which also fills in the airlines. Exact fares usually come out above the calendar low, so unchecked calendar prices are scaled by the median gap seen in the same search before ranking; otherwise every re-checked result would sink below unchecked ones. Results that keep a calendar price are marked ≈.

Exact searches query Rome, Milan and Paris by their official metro codes (ROM, MIL, PAR), so one request covers FCO+CIA or MXP+LIN+BGY and the offer carries the real airport. Calendar requests cannot say which airport a metro fare uses, so they ask for the concrete airport.

The request currency selects Ignav's market (EUR to DE, NOK to NO, SEK to SE, DKK to DK, GBP to GB, USD to US, CHF to CH, PLN to PL, anything else to US). Fares priced in a different currency than requested are left out of the ranking and the response says so. The cheapest itinerary per route and date is used. HTTP 402 (free allowance used up or billing blocked), 429 `monthly_spend_limit_reached`, 401 and 403 stop the rest of that search and return the partial result with a note; other 429s, 5xx and 424 `unable_to_complete_request` are retried with backoff.

## How a search works

1. The country expands to its scheduled-service airports from `data/airports.json`, busiest first: a hand-kept `rank` per country (set in `scripts/build-airports.mjs`), then size, then IATA. Unranked airports come last. `MAX_AIRPORTS_PER_COUNTRY` keeps the busiest, one per metro.
2. Phase 1, outbound. A provider that prices a date window (Ryanair, Ignav's fare calendar) gets the window in contiguous chunks: one chunk per 31 days for a per-day calendar, `MAX_DATES_PER_LEG` chunks for a provider that only returns the window's cheapest fare. Other providers get `MAX_DATES_PER_LEG` sampled dates (both ends, then midpoints). Lookups run chunk by chunk, so a budget cut leaves every airport with the same coverage.
3. Phase 2, returns. Only cities that got a usable outbound fare are asked, cheapest city first, for every candidate airport of that city. Window providers search earliest + min nights to latest + max nights in chunks; others pair each sampled outbound date with a sampled trip length. A city with no outbound fare costs nothing and does not make the result partial.
4. Phase 3, exact re-check (per-day calendars only, `VERIFY_TOP` > 0). Calendar prices are cheapest observed quotes, marked ≈. The legs of the top `VERIFY_TOP` combinations are re-priced with an exact one-way search, in rounds until the top is exact or 4 x `VERIFY_TOP` re-checks are spent. Unchecked calendar prices are scaled by the median exact-to-calendar ratio seen so far (always measured against the raw calendar low, kept between 1 and 2), and the ranking is redone. A leg with no exact answer keeps its ≈ price and the response says so.
5. `src/lib/ranking.ts` merges airports of one metro (MXP/LIN/BGY count as Milan), pairs outbound and return legs within the trip length, and sorts by total price then city name.

The response always states the provider and the number of provider calls used. If the call budget runs out in phase 1 or 2 the response is partial and says so; running out during the re-check only leaves some ≈ prices. It also lists every airport in play with its cheapest fares, the origins, and the cheapest outbound fare per departure date.

## Regenerating airport data

```bash
node scripts/build-airports.mjs                                  # ES IT PT FR GR TH DE GB NL HR NO SE TR US JP
node scripts/build-airports.mjs --countries=ES,DE,NL             # another list
AIRPORT_COUNTRIES=ES,IT node scripts/build-airports.mjs          # same, via env
```

The script downloads the public OurAirports `airports.csv` and `countries.csv`, keeps airports with scheduled service and an IATA code, and rewrites `data/airports.json` for the default countries (ES, IT, PT, FR, GR, TH, DE, GB, NL, HR, NO, SE, TR, US, JP). OurAirports' municipality is often a suburb or carries a region suffix, so `scripts/city-names.mjs` holds a hand-kept `CITY_NAMES` table (IATA to the name a traveller books to) that overrides `city`, and `metroName` for airports outside a metro group; add an entry when a name looks wrong. Metro groupings (Milan, Paris, London, New York, Tokyo and so on) and the per-country traffic order are hand-kept tables at the top of the script; extend both when you add countries. `node scripts/build-origins.mjs` writes `data/origins.json`, a compact worldwide list of large and medium airports with scheduled service, which backs the origin lookup `GET /api/airports?q=<text>` (up to 8 matches by IATA code, city or airport name; fewer than 2 characters returns `[]`). Both scripts need network; the app and tests do not.
