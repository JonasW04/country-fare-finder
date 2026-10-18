import type { Combination } from "@/lib/ranking";

export type TripFilter = "all" | "open-jaw" | "same-city";
export type TripSort = "price" | "nights";

export interface OpenJawSaving {
  openJaw: Combination;
  roundTrip: Combination;
  amount: number;
}

/** How much the cheapest open-jaw trip beats the cheapest same-city round trip by; null when it does not. */
export function openJawSaving(combinations: Combination[]): OpenJawSaving | null {
  const cheapest = (list: Combination[]) =>
    list.reduce<Combination | null>((best, c) => (best === null || c.total < best.total ? c : best), null);
  const openJaw = cheapest(combinations.filter((c) => c.openJaw));
  const roundTrip = cheapest(combinations.filter((c) => !c.openJaw));
  if (!openJaw || !roundTrip) return null;
  const amount = Math.round((roundTrip.total - openJaw.total) * 100) / 100;
  return amount > 0 ? { openJaw, roundTrip, amount } : null;
}

export function visibleTrips(
  combinations: Combination[],
  filter: TripFilter,
  sort: TripSort,
  metro: string | null,
): Combination[] {
  const kept = combinations.filter(
    (c) =>
      (filter === "all" || (filter === "open-jaw") === c.openJaw) &&
      (metro === null || c.flyIn.metro === metro || c.flyOut.metro === metro),
  );
  // Rank already encodes price order, so it is the price sort and the tie-break for nights.
  return sort === "nights" ? [...kept].sort((a, b) => a.nights - b.nights || a.rank - b.rank) : kept;
}
