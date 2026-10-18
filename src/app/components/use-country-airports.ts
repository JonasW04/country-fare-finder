"use client";

import { useEffect, useState } from "react";
import type { LiteAirport } from "../lib/types";

// A country's airport list does not change while the page is open, so each is fetched once.
const cache = new Map<string, Promise<LiteAirport[]>>();

function load(code: string): Promise<LiteAirport[]> {
  let pending = cache.get(code);
  if (!pending) {
    pending = fetch(`/api/country-airports?country=${encodeURIComponent(code)}`)
      .then((res) => (res.ok ? (res.json() as Promise<LiteAirport[]>) : []))
      .catch(() => {
        // A failed fetch is not cached, so the next selection of this country tries again.
        cache.delete(code);
        return [];
      });
    cache.set(code, pending);
  }
  return pending;
}

/** The airports a search of `code` prices, busiest first; null while loading. */
export function useCountryAirports(code: string): LiteAirport[] | null {
  const [loaded, setLoaded] = useState<{ code: string; airports: LiteAirport[] } | null>(null);
  useEffect(() => {
    if (!code) return;
    let live = true;
    void load(code).then((airports) => {
      if (live) setLoaded({ code, airports });
    });
    return () => {
      live = false;
    };
  }, [code]);
  return loaded?.code === code ? loaded.airports : null;
}
