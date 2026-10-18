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

Ignav has one request per origin, destination and date, and a free tier of 1000 requests a month, so the defaults keep a search small: the 12 largest airports of the country (one per metro, `MAX_AIRPORTS_PER_COUNTRY`). Each airport costs one outbound fare-calendar request (up to 31 days) plus ceil(returnWindowDays / 31) return calendar requests, and returns are only asked for airports with an outbound fare. A 7-day window with 5-10 nights has a 12-day return window, so 12 airports cost about **24 calendar requests**, plus up to 10 exact re-checks for the top 5 combinations (`VERIFY_TOP`). A second origin doubles the calendar requests.

Rome, Milan and Paris are queried by their official metro codes (ROM, MIL, PAR), so one request covers FCO+CIA or MXP+LIN+BGY. The offer carries the real airport the fare lands at, and a metro still costs one slot.

The request currency selects Ignav's market (EUR to DE, NOK to NO, SEK to SE, DKK to DK, GBP to GB, USD to US, CHF to CH, PLN to PL, anything else to US). Fares priced in a different currency than requested are left out of the ranking and the response says so. The cheapest itinerary per route and date is used. HTTP 402 (free quota used up), 401 and 403 stop the rest of that search and return the partial result with a note; 429 and 5xx are retried with backoff.

## How a search works

1. The country expands to its scheduled-service airports from `data/airports.json`, busiest first: a hand-kept `rank` per country (set in `scripts/build-airports.mjs`), then size, then IATA. Unranked airports come last. `MAX_AIRPORTS_PER_COUNTRY` keeps the busiest, one per metro.
2. Phase 1, outbound. A provider that prices a date window (Ryanair, Ignav's fare calendar) gets the window in contiguous chunks: one chunk per 31 days for a per-day calendar, `MAX_DATES_PER_LEG` chunks for a provider that only returns the window's cheapest fare. Other providers get `MAX_DATES_PER_LEG` sampled dates (both ends, then midpoints). Lookups run chunk by chunk, so a budget cut leaves every airport with the same coverage.
3. Phase 2, returns. Only cities that got a usable outbound fare are asked, cheapest city first, for every candidate airport of that city. Window providers search earliest + min nights to latest + max nights in chunks; others pair each sampled outbound date with a sampled trip length. A city with no outbound fare costs nothing and does not make the result partial.
4. Phase 3, exact re-check (per-day calendars only, `VERIFY_TOP` > 0). Calendar prices are cheapest observed quotes, marked ≈. The legs of the top `VERIFY_TOP` combinations are re-priced with an exact one-way search and the ranking is redone with those prices. A leg with no exact answer keeps its ≈ price and the response says so.
5. `src/lib/ranking.ts` merges airports of one metro (MXP/LIN/BGY count as Milan), pairs outbound and return legs within the trip length, and sorts by total price then city name.

The response always states the provider and the number of provider calls used. If the call budget runs out in phase 1 or 2 the response is partial and says so; running out during the re-check only leaves some ≈ prices. It also lists every airport in play with its cheapest fares, the origins, and the cheapest outbound fare per departure date.

## Regenerating airport data

```bash
node scripts/build-airports.mjs                                  # ES, IT, PT, FR, GR, TH
node scripts/build-airports.mjs --countries=ES,DE,NL             # another list
AIRPORT_COUNTRIES=ES,IT node scripts/build-airports.mjs          # same, via env
```

The script downloads the public OurAirports `airports.csv` and `countries.csv`, keeps airports with scheduled service and an IATA code, and rewrites `data/airports.json`. It needs network; the app and tests do not. Metro groupings (for example Milan, Paris, Rome, Bangkok, Venice) are a hand-kept table at the top of the script; add entries there when you add countries.

## Docker

```bash
docker build -t country-fare-finder .
docker run --rm -p 3000:3000 -e PORT=3000 country-fare-finder
```

## Deploy to Railway

1. Push this code to a GitHub repository (done by the maintainer, not by the app).
2. In Railway choose **New Project → Deploy from GitHub repo** and select the repository. Railway reads `railway.json` and builds with the `Dockerfile`.
3. In the service **Variables** tab set:
   - `FLIGHT_PROVIDER` = `mock`, `ryanair` or `ignav`
   - `IGNAV_API_KEY` (only for `ignav`)
   - optionally `MAX_PROVIDER_CALLS`, `CACHE_TTL_SECONDS`

   Do not set `PORT`; Railway provides it.
4. Under **Settings → Deploy**, confirm the healthcheck path is `/api/health` (already in `railway.json`).
5. Generate a public domain under **Settings → Networking** and open it. `/api/health` should return `"status":"ok"` and the active provider.
