// Cheap is mint, dear is sunset. A straight mint-to-sunset blend turns muddy olive in the middle,
// so the scale passes through a warm amber instead.
type Rgb = [number, number, number];
const MINT: Rgb = [0x2b, 0xd4, 0xa4];
const STOPS: Rgb[] = [MINT, [0xff, 0xc9, 0x4d], [0xff, 0x6b, 0x3d]];

function hex(n: number): string {
  return Math.round(n).toString(16).padStart(2, "0");
}

/** Position of a price between the cheapest and dearest seen, clamped to 0..1; 0 when all are equal. */
export function priceRatio(value: number, min: number, max: number): number {
  if (!(max > min)) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

export function priceColor(value: number, min: number, max: number): string {
  const t = priceRatio(value, min, max) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(t));
  const f = t - i;
  const a = STOPS[i] ?? MINT;
  const b = STOPS[i + 1] ?? MINT;
  return `#${a.map((c, k) => hex(c + ((b[k] ?? c) - c) * f)).join("")}`;
}

export function priceExtent(values: number[]): { min: number; max: number } | null {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return null;
  return { min: Math.min(...finite), max: Math.max(...finite) };
}
