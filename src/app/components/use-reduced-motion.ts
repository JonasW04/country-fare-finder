"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** SVG animation (animateMotion) ignores the CSS media query, so components ask this instead. */
export function useReducedMotion(): boolean {
  // The server cannot know, so it assumes reduced motion and renders the static state.
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => true);
}
