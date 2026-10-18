"use client";

import { useEffect, useState } from "react";
import { originLabel, type OriginSuggestion } from "../lib/origin-input";

function isSuggestionList(value: unknown): value is OriginSuggestion[] {
  return (
    Array.isArray(value) &&
    value.every((v) => typeof v === "object" && v !== null && typeof (v as OriginSuggestion).iata === "string")
  );
}

async function fetchSuggestions(query: string, signal?: AbortSignal): Promise<OriginSuggestion[]> {
  const res = await fetch(`/api/airports?q=${encodeURIComponent(query)}`, { signal });
  const body: unknown = res.ok ? await res.json() : [];
  return isSuggestionList(body) ? body.slice(0, 8) : [];
}

/** "London Stansted · STN" for a code from a link; the bare code when the lookup fails or finds nothing. */
export async function labelForCode(code: string): Promise<string> {
  try {
    const match = (await fetchSuggestions(code)).find((s) => s.iata === code);
    return match ? originLabel(match) : code;
  } catch {
    return code;
  }
}

/**
 * Suggestions for what is typed in the origin field. Lives above the combobox because submitting
 * the search resolves typed text ("oslo") to the first suggestion's code.
 */
export function useAirportSuggestions(text: string): OriginSuggestion[] {
  const [results, setResults] = useState<{ query: string; items: OriginSuggestion[] }>({ query: "", items: [] });
  const query = text.trim();
  // A picked label is already resolved; looking it up again would only match by accident.
  const searchable = query.length >= 2 && !query.includes("·");

  useEffect(() => {
    if (!searchable) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchSuggestions(query, controller.signal)
        .then((items) => setResults({ query, items }))
        .catch(() => undefined);
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchable]);

  return searchable && results.query === query ? results.items : [];
}
