# Provider addendum: ignav (full-carrier, API key)

Ryanair barely serves Norway (OSL has 2 destinations in a typical window). Ignav covers all carriers. Account exists; key lives in env `IGNAV_API_KEY`. Verified live 18 Oct 2026: OSL->FCO 2026-11-20 returned real itineraries (Air Serbia via BEG, 97 USD).

## Endpoint

`POST https://ignav.com/api/fares/one-way`, header `X-Api-Key: $IGNAV_API_KEY`, JSON body:
`origin`, `destination` (IATA airport or metro code), `departure_date` (YYYY-MM-DD), optional `adults`, `cabin_class` (economy|premium_economy|business|first), `max_stops`, `market` (2-letter country, default US, sets currency).

Response: `{origin, destination, departure_date, observed_at, cache_hit, itineraries:[{price:{amount,currency,status}, outbound:{carrier, duration_minutes, segments:[{marketing_carrier_code, flight_number, departure_airport, departure_time_local, arrival_airport, arrival_time_local, ...}]}, cabin_class, requires_self_transfer, ignav_id}]}`. Recorded real response: `tests/fixtures/ignav-one-way.json`.

Errors: `{error:{type,code,message,field}}`. Codes that matter: 401 `invalid_api_key`/`api_key_required`, 403 `email_not_verified`, 402 `billing_required` (free tier of 1000 req/month used up; account has no card so it can never spend), 400 `invalid_airport_code`, `departure_date_in_past`, 429, 5xx `upstream_error`.

## Requirements

- `src/lib/providers/ignav.ts` implements `FlightProvider`. Key read only server side. Never log or echo the key; mask it in any surfaced error.
- One request per (origin, destination, date). No range or country queries exist, so this is a per-date provider (not `rangeQueries`). Metered: call the existing `onRequest` budget hook before each fetch.
- Free tier is 1000 requests/month, so cap cost per search:
  - New env `MAX_AIRPORTS_PER_COUNTRY`, default 6 for ignav (unset = no cap for other providers). Pick the largest airports first (dataset already orders largest first) and dedupe metros.
  - Default `MAX_DATES_PER_LEG` 2 when provider is ignav, unless env overrides.
  - Target: a default ignav search costs at most ~30 requests. State the per-search cost in README.
- Map the request currency to `market` (EUR->DE, NOK->NO, SEK->SE, DKK->DK, GBP->GB, USD->US, CHF->CH, PLN->PL; else US). Report the currency the response actually returns.
- Cheapest itinerary per (route, date) becomes the Offer; carriers from segment `marketing_carrier_code` (unique, ordered). Keep `requires_self_transfer` on the offer if the Offer type can carry it cheaply; otherwise skip.
- 402 `billing_required`: stop issuing further ignav requests for the rest of that search, return partial results, note "Ignav free quota (1000 requests/month) is used up". 401/403: one clear note, no retry. 429/5xx: existing retry with backoff. Empty itineraries = no fare, not an error.
- `FLIGHT_PROVIDER=ignav` selects it. If ignav selected and key missing: fall back to mock, labelled, like the amadeus path.
- `/api/health`: provider name and `credentialsPresent` boolean only.
- Remove the dead Amadeus provider (service shut down): delete `amadeus.ts`, its tests and env docs, and drop it from `FLIGHT_PROVIDER` values. Keep `mock` the default.
- Update README env table and `.env.example` (names and placeholders only).

## Tests (offline, stub fetch)

Mapping from the recorded fixture; cheapest-itinerary selection; market mapping; airport cap and metro dedupe; 402 stops further calls and marks partial with the note; 401 note without retry; 429 retry then give up; key never appears in errors or notes; per-search request count under default config <= 30 for a 41-airport country.
