import { addDays, isIsoDate, nightsBetween } from "./dates";
import { supportedCountries } from "./airports";

export interface SearchRequest {
  origin: string;
  secondOrigin?: string;
  country: string;
  earliest: string;
  latest: string;
  minNights: number;
  maxNights: number;
  cabin: string;
  adults: number;
  currency: string;
  limit: number;
}

export type ParseResult = { ok: true; request: SearchRequest } | { ok: false; errors: string[] };

const MAX_WINDOW_DAYS = 31;
const MAX_NIGHTS = 30;

type Raw = Record<string, unknown>;

function text(raw: Raw, key: string): string {
  const v = raw[key];
  return typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
}

function int(raw: Raw, key: string, fallback: number, errors: string[], min: number, max: number): number {
  const s = text(raw, key);
  if (s === "") return fallback;
  const n = Number(s);
  if (!Number.isInteger(n) || n < min || n > max) {
    errors.push(`${key} must be an integer between ${min} and ${max}`);
    return fallback;
  }
  return n;
}

/** Validates untrusted input (query string or JSON body). `today` is injected to keep it deterministic. */
export function parseSearchRequest(raw: Raw, today: string): ParseResult {
  const errors: string[] = [];
  const origin = text(raw, "origin").toUpperCase();
  const secondOrigin = text(raw, "secondOrigin").toUpperCase();
  const country = text(raw, "country").toUpperCase();
  const earliest = text(raw, "earliest");
  const latest = text(raw, "latest") || earliest;
  const cabin = (text(raw, "cabin") || "ECONOMY").toUpperCase();
  const currency = (text(raw, "currency") || "EUR").toUpperCase();

  if (!/^[A-Z]{3}$/.test(origin)) errors.push("origin must be a 3-letter IATA code");
  if (secondOrigin && !/^[A-Z]{3}$/.test(secondOrigin)) errors.push("secondOrigin must be a 3-letter IATA code");
  if (secondOrigin && secondOrigin === origin) errors.push("secondOrigin must differ from origin");
  if (!(country in supportedCountries())) {
    errors.push(`country must be one of: ${Object.keys(supportedCountries()).join(", ")}`);
  }
  if (!/^[A-Z_]{3,20}$/.test(cabin)) errors.push("cabin must be letters and underscores only");
  if (!/^[A-Z]{3}$/.test(currency)) errors.push("currency must be a 3-letter code");

  if (!isIsoDate(earliest) || !isIsoDate(latest)) {
    errors.push("earliest and latest must be dates in YYYY-MM-DD form");
  } else {
    if (earliest < today) errors.push("earliest must not be in the past");
    if (latest < earliest) errors.push("latest must not be before earliest");
    else if (nightsBetween(earliest, latest) + 1 > MAX_WINDOW_DAYS) {
      errors.push(`outbound window must be at most ${MAX_WINDOW_DAYS} days`);
    }
  }

  const minNights = int(raw, "minNights", 5, errors, 1, MAX_NIGHTS);
  const maxNights = int(raw, "maxNights", Math.max(minNights, 10), errors, 1, MAX_NIGHTS);
  if (maxNights < minNights) errors.push("maxNights must not be below minNights");
  const adults = int(raw, "adults", 1, errors, 1, 9);
  const limit = int(raw, "limit", 10, errors, 1, 50);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    request: {
      origin,
      secondOrigin: secondOrigin || undefined,
      country,
      earliest,
      latest,
      minNights,
      maxNights,
      cabin,
      adults,
      currency,
      limit,
    },
  };
}

export function returnWindow(req: Pick<SearchRequest, "earliest" | "latest" | "minNights" | "maxNights">) {
  return { from: addDays(req.earliest, req.minNights), to: addDays(req.latest, req.maxNights) };
}
