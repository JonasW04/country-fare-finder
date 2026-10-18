import { addDays } from "@/lib/dates";

export interface DateWindow {
  earliest: string;
  latest: string;
  /** Set when the preset implies a trip length, as a weekend does. */
  nights?: { min: number; max: number };
}

export interface DatePreset {
  id: string;
  label: string;
  window: (today: string) => DateWindow;
}

/** Today in the viewer's own time zone; they mean their calendar day, not UTC's. */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function weekday(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** Leave Friday or Saturday of the next weekend that is at least two days away, back after 2-3 nights. */
export function nextWeekend(today: string): DateWindow {
  const FRIDAY = 5;
  let ahead = (FRIDAY - weekday(today) + 7) % 7;
  // On Thursday or Friday "next weekend" means the following one: there is no time to plan this one.
  if (ahead < 2) ahead += 7;
  const friday = addDays(today, ahead);
  return { earliest: friday, latest: addDays(friday, 1), nights: { min: 2, max: 3 } };
}

export function inTwoWeeks(today: string): DateWindow {
  return { earliest: addDays(today, 14), latest: addDays(today, 20) };
}

/** Every day of the next calendar month: at most 31 days, which the search accepts. */
export function nextMonth(today: string): DateWindow {
  const [y, m] = today.split("-").map(Number);
  const year = y ?? 1970;
  const month = m ?? 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonthIndex = month === 12 ? 1 : month + 1;
  const first = `${nextYear}-${String(nextMonthIndex).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(nextYear, nextMonthIndex, 0)).getUTCDate();
  return { earliest: first, latest: `${first.slice(0, 8)}${String(lastDay).padStart(2, "0")}` };
}

/** A one-week window starting 3 to 5 weeks out, so the whole trip leaves within six weeks. */
export function surpriseWindow(today: string, random: () => number): DateWindow {
  const earliest = addDays(today, 21 + Math.floor(random() * 15));
  return { earliest, latest: addDays(earliest, 7) };
}

export const DATE_PRESETS: DatePreset[] = [
  { id: "weekend", label: "Next weekend", window: nextWeekend },
  { id: "two-weeks", label: "In 2 weeks", window: inTwoWeeks },
  { id: "next-month", label: "Next month", window: nextMonth },
];
