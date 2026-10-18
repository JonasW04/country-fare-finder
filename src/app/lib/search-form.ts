import { addDays } from "@/lib/dates";

export const CABINS = [
  { value: "ECONOMY", label: "Economy" },
  { value: "PREMIUM_ECONOMY", label: "Premium economy" },
  { value: "BUSINESS", label: "Business" },
  { value: "FIRST", label: "First" },
] as const;

export const CURRENCIES = ["EUR", "GBP", "USD", "NOK", "SEK", "DKK", "CHF", "PLN"] as const;

export interface SearchForm {
  /** IATA code, empty until the traveller picks or types one. */
  origin: string;
  secondOrigin: string;
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

export function defaultForm(today: string, country: string): SearchForm {
  return {
    origin: "",
    secondOrigin: "",
    country,
    earliest: addDays(today, 21),
    latest: addDays(today, 27),
    minNights: 5,
    maxNights: 10,
    cabin: "ECONOMY",
    adults: 1,
    currency: "EUR",
    limit: 10,
  };
}

/** A shared link carries a search when it names at least an origin and a country. */
export function linkHasSearch(params: Record<string, string>): boolean {
  return Boolean(params.origin && params.country);
}

/**
 * Lenient on purpose: a hand-edited link fills what it can and the API reports the rest, so the
 * traveller sees the same validation messages whichever way the search started.
 */
export function formFromParams(params: Record<string, string>, base: SearchForm): SearchForm {
  const code = (key: string, fallback: string) => (params[key] ?? fallback).trim().toUpperCase();
  const num = (key: string, fallback: number) => {
    const n = Number.parseInt(params[key] ?? "", 10);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    origin: code("origin", base.origin),
    secondOrigin: code("secondOrigin", base.secondOrigin),
    country: code("country", base.country),
    earliest: params.earliest ?? base.earliest,
    latest: params.latest ?? base.latest,
    minNights: num("minNights", base.minNights),
    maxNights: num("maxNights", base.maxNights),
    cabin: code("cabin", base.cabin),
    adults: num("adults", base.adults),
    currency: code("currency", base.currency),
    limit: num("limit", base.limit),
  };
}

export function paramsFromForm(form: SearchForm): URLSearchParams {
  const params = new URLSearchParams({ origin: form.origin });
  if (form.secondOrigin) params.set("secondOrigin", form.secondOrigin);
  params.set("country", form.country);
  params.set("earliest", form.earliest);
  params.set("latest", form.latest);
  params.set("minNights", String(form.minNights));
  params.set("maxNights", String(form.maxNights));
  params.set("cabin", form.cabin);
  params.set("adults", String(form.adults));
  params.set("currency", form.currency);
  params.set("limit", String(form.limit));
  return params;
}

/**
 * The IATA code in what the traveller typed: a bare code ("osl") or a picked suggestion's label
 * ("Oslo · OSL"). Empty when neither, so free text never reaches the API as an origin.
 */
export function originCodeFromText(text: string): string {
  const trimmed = text.trim();
  const labelled = /·\s*([A-Za-z]{3})$/.exec(trimmed);
  if (labelled?.[1]) return labelled[1].toUpperCase();
  return /^[A-Za-z]{3}$/.test(trimmed) ? trimmed.toUpperCase() : "";
}
