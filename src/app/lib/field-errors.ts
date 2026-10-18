/** The search bar controls a validation message can sit under. */
export type ErrorField = "origin" | "country" | "dates" | "nights" | "options" | "general";

/** Shown before any request when the From box names no airport. */
export const MISSING_ORIGIN = "Tell us where you're flying from: a city, or an airport code like OSL.";

// The API names the offending parameter as the first word of each message ("maxNights must…").
const FIELD_BY_PARAM: Record<string, ErrorField> = {
  origin: "origin",
  country: "country",
  earliest: "dates",
  latest: "dates",
  outbound: "dates",
  minNights: "nights",
  maxNights: "nights",
  secondOrigin: "options",
  cabin: "options",
  adults: "options",
  currency: "options",
  limit: "options",
};

export function fieldForError(message: string): ErrorField {
  if (message === MISSING_ORIGIN) return "origin";
  const param = message.split(" ", 1)[0] ?? "";
  return Object.hasOwn(FIELD_BY_PARAM, param) ? (FIELD_BY_PARAM[param] ?? "general") : "general";
}

/** Groups messages by control, keeping their order, with the first letter raised for display. */
export function errorsByField(messages: readonly string[]): Partial<Record<ErrorField, string[]>> {
  const grouped: Partial<Record<ErrorField, string[]>> = {};
  for (const message of messages) {
    const field = fieldForError(message);
    const text = message.charAt(0).toUpperCase() + message.slice(1);
    (grouped[field] ??= []).push(text);
  }
  return grouped;
}
