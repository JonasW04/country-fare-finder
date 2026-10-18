"use client";

import { useSyncExternalStore } from "react";

const KEY = "cff:last-origin";

export interface OriginChoice {
  iata: string;
  label: string;
}

// Private browsing and disabled storage throw on access; remembering the origin is only a nicety.
function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function rememberOrigin(choice: OriginChoice): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(choice));
  } catch {
    // See read().
  }
}

export function parseStoredOrigin(raw: string | null): OriginChoice | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { iata, label } = value as Record<string, unknown>;
    return typeof iata === "string" && /^[A-Z]{3}$/.test(iata) && typeof label === "string" ? { iata, label } : null;
  } catch {
    return null;
  }
}

/** The raw stored string; callers parse it, since a snapshot must be stable between renders. */
export function useStoredOriginRaw(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
