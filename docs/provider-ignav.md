# Provider addendum: ignav (full-carrier, API key)

Ryanair barely serves Norway (OSL has 2 destinations in a typical window). Ignav covers all carriers. Account exists; key lives in env `IGNAV_API_KEY`. Verified live 18 Oct 2026: OSL->FCO 2026-11-20 returned real itineraries (Air Serbia via BEG, 97 USD).

## Endpoint

`POST https://ignav.com/api/fares/one-way`, header `X-Api-Key: $IGNAV_API_KEY`, JSON body:
`origin`, `destination` (IATA airport or metro code), `departure_date` (YYYY-MM-DD), optional `adults`, `cabin_class` (economy|premium_economy|business|first), `max_stops`, `market` (2-letter country, default US, sets currency).

Response: `{origin, destination, departure_date, observed_at, cache_hit, itineraries:[{price:{amount,currency,status}, outbound:{carrier, duration_minutes, segments:[{marketing_carrier_code, flight_number, departure_airport, departure_time_local, arrival_airport, arrival_time_local, ...}]}, cabin_class, requires_self_transfer, ignav_id}]}`. Recorded real response: `tests/fixtures/ignav-one-way.json`.

Errors: `{error:{type,code,message,field}}`. Codes that matter: 401 `invalid_api_key`/`api_key_required`, 403 `email_not_verified`, 402 `billing_required` (the one-time 1,000-request free allowance is used up or billing is blocked; the account has no card so it can never spend), 400 `invalid_airport_code`, `departure_date_in_past`, 429, 5xx `upstream_error`.

## Requirements

- `src/lib/providers/ignav.ts` implements `FlightProvider`. Key read only server side. Never log or echo the key; mask it in any surfaced error.
- One request per (origin, destination, date) on the one-way endpoint; a query with `dateTo` uses the fare calendar (below), so the provider declares `range = { maxDays: 31, perDay: true }`. Metered: call the existing `onRequest` budget hook before each fetch.
- The free allowance is a one-time 1,000 requests that never resets; after that it is $2.00 per 1,000 successful requests. So cap cost per search:
  - New env `MAX_AIRPORTS_PER_COUNTRY`, default 6 for ignav (unset = no cap for other providers). Pick the largest airports first (dataset already orders largest first) and dedupe metros.
  - Default `MAX_DATES_PER_LEG` 2 when provider is ignav, unless env overrides.
  - Target: a default ignav search costs at most ~30 requests. State the per-search cost in README.
- Map the request currency to `market` (EUR->DE, NOK->NO, SEK->SE, DKK->DK, GBP->GB, USD->US, CHF->CH, PLN->PL; else US). Report the currency the response actually returns.
- Cheapest itinerary per (route, date) becomes the Offer; carriers from segment `marketing_carrier_code` (unique, ordered). Keep `requires_self_transfer` on the offer if the Offer type can carry it cheaply; otherwise skip.
- 402 `billing_required`: stop issuing further ignav requests for the rest of that search, return partial results, note "Ignav billing is required: the one-time 1,000 free requests are used up or billing is blocked". 429 `monthly_spend_limit_reached` also stops the search ("Ignav monthly spending limit reached.") and is not retried; any other 429 is retried. 401/403: one clear note, no retry. 429/5xx: existing retry with backoff. Empty itineraries = no fare, not an error.
- `FLIGHT_PROVIDER=ignav` selects it. If ignav selected and key missing: fall back to mock, labelled, like the amadeus path.
- `/api/health`: provider name and `credentialsPresent` boolean only.
- Remove the dead Amadeus provider (service shut down): delete `amadeus.ts`, its tests and env docs, and drop it from `FLIGHT_PROVIDER` values. Keep `mock` the default.
- Update README env table and `.env.example` (names and placeholders only).

## Tests (offline, stub fetch)

Mapping from the recorded fixture; cheapest-itinerary selection; market mapping; airport cap and metro dedupe; 402 stops further calls and marks partial with the note; 401 note without retry; 429 retry then give up; key never appears in errors or notes; per-search request count under default config <= 30 for a 41-airport country.

## Fare calendar (cheapest dates)

`POST https://ignav.com/api/fares/cheapest-dates`, header `X-Api-Key`. Ignav renamed this endpoint from `/api/fares/calendar` around 19 Oct 2026; the old path now answers 404 `route_not_found`. One request returns the lowest fare for every departure date of a window of 1-31 days and counts as one request for billing (same $2.00 per 1,000 successful requests; the first 1,000 are a one-time free allowance).

Request (extra fields are rejected): `origin`, `destination` (airport or metro IATA), `departure_date_range: {start, end}` (inclusive YYYY-MM-DD, 1-31 days, start not before today), optional `adults`, `cabin_class`, `market`, `stay_days` (omit for one-way). The provider sends only `origin`, `destination`, `departure_date_range`, `adults`, `cabin_class` (when valid) and `market`.

Response: `{origin, destination, dates: [{departure_date, return_date?, price: {amount, currency, status: "unverified"} | null}], observed_at}`, one entry per requested date in ascending order. A null price means no qualifying fare was found. Entries carry no itinerary or booking id. Recorded real response: `tests/fixtures/ignav-cheapest-dates.json`.

Mapping: each date with a price becomes an Offer with `estimate: true` and no carriers; null prices are skipped. Metro codes are refused for range queries, because the response cannot say which airport a fare uses.

Errors: 402 billing required or blocked (stops the search); 429 `monthly_spend_limit_reached` (stops the search, never retried); other 429 and 503 `billing_period_unavailable` (retried); 424 `unable_to_complete_request` (retried with backoff); 424 `unsupported_search` and other 424 codes are not retried.
