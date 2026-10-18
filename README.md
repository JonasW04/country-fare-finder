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
| `FLIGHT_PROVIDER` | `mock` | `mock`, `ryanair` or `amadeus`. `ryanair` needs no key. If `amadeus` is chosen without credentials the app falls back to mock and labels the response. |
| `AMADEUS_CLIENT_ID` | none | Amadeus Self-Service API key. Server side only. |
| `AMADEUS_CLIENT_SECRET` | none | Amadeus Self-Service API secret. Server side only. |
| `AMADEUS_BASE_URL` | `https://test.api.amadeus.com` | Override the Amadeus host. |
| `MAX_PROVIDER_CALLS` | `60` | Provider calls allowed per search, retries included. When it runs out the response is marked partial. |
| `CACHE_TTL_SECONDS` | `1200` | Lifetime of cached route/date fares. |
| `SEARCH_CONCURRENCY` | `4` (`2` for `ryanair`) | Parallel provider calls. |
| `PROVIDER_TIMEOUT_MS` | `10000` | Per-call timeout. |
| `PROVIDER_RETRIES` | `2` | Retries on 429/5xx/timeout, with exponential backoff. |
| `PROVIDER_BACKOFF_MS` | `400` | Base backoff delay. |
| `MAX_DATES_PER_LEG` | `3` | Outbound dates sampled per search. |
| `PORT` | `3000` | Set by Railway; `npm start` honours it. |

## Live fares with Ryanair (no key)

Set `FLIGHT_PROVIDER=ryanair` to price real Ryanair fares from its public fare-finder endpoint (`services-api.ryanair.com/farfnd/v4/oneWayFares`). It needs no credentials and `/api/health` reports `credentialsPresent: false`. With this provider `MAX_PROVIDER_CALLS` counts real HTTP requests: one country-wide request per sampled outbound date (shared by every airport) plus one request per airport covering the whole return window, so a full 41-airport search costs about 44 requests. `providerCalls` reports those requests, while `lookupsPlanned` and `lookupsSkipped` still count logical lookups. Only Ryanair routes are covered, and the endpoint is undocumented, so it can change or throttle without notice. HTTP 429, HTTP 403, empty results and an unexpected response shape are reported as partial results with a note; no fare is ever invented. `mock` remains the default.

## How a search works

1. The country expands to its scheduled-service airports from `data/airports.json`, largest first.
2. Up to `MAX_DATES_PER_LEG` outbound dates are sampled across the window (both ends, then midpoints), each paired with a trip length from the min/max range.
3. Each airport gets a one-way `origin -> airport` lookup and an `airport -> origin` lookup. Lookups run tier by tier so every airport has coverage before any gets extra dates.
4. `src/lib/ranking.ts` merges airports of one metro (MXP/LIN/BGY count as Milan), pairs outbound and return legs within the trip length, and sorts by total price then city name.

The response always states the provider and the number of provider calls used. If the call budget is exhausted the response is partial and says so.

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
   - `FLIGHT_PROVIDER` = `mock`, `ryanair` or `amadeus`
   - `AMADEUS_CLIENT_ID` and `AMADEUS_CLIENT_SECRET` (only for `amadeus`)
   - optionally `AMADEUS_BASE_URL`, `MAX_PROVIDER_CALLS`, `CACHE_TTL_SECONDS`

   Do not set `PORT`; Railway provides it.
4. Under **Settings → Deploy**, confirm the healthcheck path is `/api/health` (already in `railway.json`).
5. Generate a public domain under **Settings → Networking** and open it. `/api/health` should return `"status":"ok"` and the active provider.
