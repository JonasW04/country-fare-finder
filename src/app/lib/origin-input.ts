// What the origin field means. The field shows a label ("Oslo · OSL") but the search needs the code.

export interface OriginSuggestion {
  iata: string;
  name: string;
  city: string;
  country: string;
}

/**
 * "London Stansted · STN" when the airport name starts with its city, so a city with several
 * airports reads distinctly; otherwise "Oslo · OSL" (the name "Oslo-Gardermoen…" adds nothing).
 */
export function originLabel(s: OriginSuggestion): string {
  const short = s.name.replace(/\s+(International\s+)?Airport$/i, "").trim();
  const place = short.startsWith(`${s.city} `) ? short : s.city;
  return `${place} · ${s.iata}`;
}

/**
 * The IATA code to search from, given the field's text and the suggestions shown for it:
 * a picked label yields its code, typed text yields the matching or first suggestion, and a bare
 * three-letter code is accepted when no suggestion has loaded. Empty when none of these applies,
 * so display text never reaches the API as an origin.
 */
export function originCodeFromInput(text: string, suggestions: readonly OriginSuggestion[]): string {
  const trimmed = text.trim();
  const labelled = /·\s*([A-Za-z]{3})$/.exec(trimmed);
  if (labelled?.[1]) return labelled[1].toUpperCase();
  const exact = suggestions.find((s) => s.iata === trimmed.toUpperCase());
  const chosen = exact ?? suggestions[0];
  if (chosen) return chosen.iata;
  return /^[A-Za-z]{3}$/.test(trimmed) ? trimmed.toUpperCase() : "";
}
