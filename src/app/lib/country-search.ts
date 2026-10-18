/**
 * Countries matching what the traveller typed: names starting with it first ("ita" → Italy before
 * Mauritania), then names containing it, then an exact ISO code ("gb"). Empty text lists them all.
 */
export function matchCountries<T extends { code: string; name: string }>(countries: readonly T[], text: string): T[] {
  const q = text.trim().toLowerCase();
  if (!q) return [...countries];
  const starts: T[] = [];
  const contains: T[] = [];
  for (const c of countries) {
    const name = c.name.toLowerCase();
    if (name.startsWith(q)) starts.push(c);
    else if (name.includes(q) || c.code.toLowerCase() === q) contains.push(c);
  }
  return [...starts, ...contains];
}
