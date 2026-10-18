"use client";

import type { Feature, Geometry } from "geojson";
import { useEffect, useState } from "react";

type Shape = Feature<Geometry>;

// Shapes never change while the page is open, so one fetch per country is enough.
const cache = new Map<string, Promise<Shape | null>>();

function load(code: string): Promise<Shape | null> {
  let pending = cache.get(code);
  if (!pending) {
    pending = fetch(`/shapes/${code}.json`)
      .then((res) => (res.ok ? (res.json() as Promise<Shape>) : null))
      .catch(() => null);
    cache.set(code, pending);
  }
  return pending;
}

/** The country outline, or null while loading or when the country has no shape file. */
export function useCountryShape(code: string): Shape | null {
  const [loaded, setLoaded] = useState<{ code: string; shape: Shape | null } | null>(null);
  useEffect(() => {
    let live = true;
    void load(code).then((shape) => {
      if (live) setLoaded({ code, shape });
    });
    return () => {
      live = false;
    };
  }, [code]);
  return loaded?.code === code ? loaded.shape : null;
}
