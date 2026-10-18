# Provider addendum: ryanair (keyless)

Amadeus Self-Service is shut down and Travelpayouts needs an account. Ryanair's fare finder is public, needs no key, and returns real prices, so it becomes the first live provider.

## Endpoint

`GET https://services-api.ryanair.com/farfnd/v4/oneWayFares`

Query parameters: `departureAirportIataCode`, `outboundDepartureDateFrom`, `outboundDepartureDateTo` (both `YYYY-MM-DD`), `currency`, `limit`, and optionally `arrivalCountryCode`.

Verified response shape (live call, 18 Oct 2026):

```json
{"fares":[{"outbound":{
  "departureAirport":{"countryName":"Norway","iataCode":"OSL","name":"Oslo","city":{"name":"Oslo"}},
  "arrivalAirport":{"countryName":"United Kingdom","iataCode":"STN","name":"London Stansted","city":{"name":"London"}},
  "departureDate":"2026-11-23T20:45:00","arrivalDate":"2026-11-23T22:00:00",
  "price":{"value":23.99,"currencyCode":"EUR"}}}]}
```

`GET .../v4/roundTripFares` takes the same parameters plus `inboundDepartureDateFrom` and `inboundDepartureDateTo`, and returns `fares[].outbound` / `fares[].inbound` plus a `summary.price`.

## Requirements

- `src/lib/providers/ryanair.ts` implements the existing `FlightProvider` interface. No credentials, no OAuth.
- Send a browser-like `User-Agent`; the endpoint rejects some default agent strings.
- Outbound leg: one call per origin with `arrivalCountryCode` set to the target country and the outbound window, then keep fares whose arrival airport is in the bundled dataset for that country.
- Return leg: call the same endpoint from each candidate arrival airport back to the origin over the return window. Cache each call for 20 minutes under the existing cache.
- Honour the existing `MAX_PROVIDER_CALLS` budget and bounded concurrency. Set the provider default concurrency to 2 and keep retry with backoff.
- 429, 403 and empty `fares` are limitations, not errors: record them in the existing notes and partial-result fields, and never fabricate a fare.
- The endpoint is undocumented and can change. Treat a schema mismatch as a provider limitation with a clear message, not a crash.
- `FLIGHT_PROVIDER=ryanair` selects it. `mock` stays the default so the app always works. Update `README.md` and `.env.example` accordingly.
- `/api/health` reports the active provider name and whether credentials are present (boolean only).

## Tests

Stub `fetch` with the recorded shapes above. Cover: fare mapping to the internal Offer shape, airports the dataset does not contain being skipped, an empty `fares` array, a 429 with retry then surrender, and the schema-mismatch path. No live network calls in tests. Add the fixture under `tests/fixtures/`.
