// Display formatting shared by the search sentence, loading state and results.

export function formatMoney(amount: number, currency: string, wholeUnits = false): string {
  const digits = wholeUnits ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {};
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, ...digits }).format(amount);
  } catch {
    // An unknown currency code makes Intl throw; the amount is still worth showing.
    return `${amount.toFixed(wholeUnits ? 0 : 2)} ${currency}`;
  }
}

function utc(iso: string): Date {
  // Dates are calendar days, so format them in UTC to keep the viewer's time zone from shifting them.
  return new Date(`${iso}T00:00:00Z`);
}

/** "Thu 12 Nov" */
export function formatDay(iso: string): string {
  return utc(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** "12" for the calendar strip. */
export function dayOfMonth(iso: string): string {
  return String(utc(iso).getUTCDate());
}

/** "8–14 Nov", or "28 Nov – 3 Dec" when the months differ. */
export function formatSpan(from: string, to: string): string {
  const month = (iso: string) => utc(iso).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  const day = (iso: string) => utc(iso).getUTCDate();
  if (from === to) return `${day(from)} ${month(from)}`;
  if (month(from) === month(to)) return `${day(from)}–${day(to)} ${month(to)}`;
  return `${day(from)} ${month(from)} – ${day(to)} ${month(to)}`;
}

/** "T" for the calendar strip: the first letter of the English weekday. */
export function weekdayLetter(iso: string): string {
  return utc(iso).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }).charAt(0);
}

export function nightsLabel(nights: number): string {
  return `${nights} ${nights === 1 ? "night" : "nights"}`;
}

export function providerLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
