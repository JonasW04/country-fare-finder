"use client";

import type { FeatureCollection, Geometry } from "geojson";
import { useEffect, useState } from "react";

export interface WorldProps {
  iso2: string | null;
  name: string;
}

export type World = FeatureCollection<Geometry, WorldProps>;

let pending: Promise<World | null> | null = null;

function load(): Promise<World | null> {
  pending ??= fetch("/shapes/world.json")
    .then((res) => (res.ok ? (res.json() as Promise<World>) : null))
    .catch(() => {
      pending = null;
      return null;
    });
  return pending;
}

/** The 110m world outlines, fetched once per page; null until loaded. */
export function useWorld(): World | null {
  const [world, setWorld] = useState<World | null>(null);
  useEffect(() => {
    let live = true;
    void load().then((w) => {
      if (live) setWorld(w);
    });
    return () => {
      live = false;
    };
  }, []);
  return world;
}
