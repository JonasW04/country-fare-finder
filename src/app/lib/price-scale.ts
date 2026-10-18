// Neutral price scale: no rainbow. A price is only ever in the cheap, middle or dear third.
export type PriceTercile = 0 | 1 | 2;

/** Position of a price between the cheapest and dearest seen, clamped to 0..1; 0 when all are equal. */
export function priceRatio(value: number, min: number, max: number): number {
  if (!(max > min)) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

export function priceTercile(value: number, min: number, max: number): PriceTercile {
  const r = priceRatio(value, min, max);
  return r < 1 / 3 ? 0 : r < 2 / 3 ? 1 : 2;
}

/** Fill for a price on the map: only the cheap third stands out. */
export function priceColor(value: number, min: number, max: number): string {
  return priceTercile(value, min, max) === 0 ? "var(--color-accent)" : "var(--color-subtle)";
}

export function priceExtent(values: number[]): { min: number; max: number } | null {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return null;
  return { min: Math.min(...finite), max: Math.max(...finite) };
}
