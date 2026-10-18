const DAY_MS = 86_400_000;

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function nightsBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function enumerateDates(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Picks up to `max` dates in priority order: both ends first, then repeated midpoints.
 * Callers that run out of budget part-way still have covered the window's spread.
 */
export function sampleDates(dates: string[], max: number): string[] {
  if (max <= 0 || dates.length === 0) return [];
  const picked: number[] = [];
  const seen = new Set<number>();
  const take = (i: number) => {
    if (!seen.has(i) && picked.length < max) {
      seen.add(i);
      picked.push(i);
    }
  };
  take(0);
  take(dates.length - 1);
  const queue: [number, number][] = [[0, dates.length - 1]];
  while (queue.length && picked.length < max) {
    const [lo, hi] = queue.shift() ?? [0, 0];
    if (hi - lo < 2) continue;
    const mid = Math.floor((lo + hi) / 2);
    take(mid);
    queue.push([lo, mid], [mid, hi]);
  }
  return picked.map((i) => dates[i] ?? "").filter(Boolean);
}
