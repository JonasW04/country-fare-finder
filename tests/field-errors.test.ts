import { describe, expect, it } from "vitest";
import { MISSING_ORIGIN, errorsByField, fieldForError } from "@/app/lib/field-errors";

describe("fieldForError", () => {
  it.each([
    ["origin must be a 3-letter IATA code", "origin"],
    [MISSING_ORIGIN, "origin"],
    ["country must be one of: IT, ES", "country"],
    ["earliest must not be in the past", "dates"],
    ["latest must not be before earliest", "dates"],
    ["earliest and latest must be dates in YYYY-MM-DD form", "dates"],
    ["outbound window must be at most 31 days", "dates"],
    ["minNights must be an integer between 1 and 30", "nights"],
    ["maxNights must not be below minNights", "nights"],
    ["secondOrigin must differ from origin", "options"],
    ["cabin must be letters and underscores only", "options"],
    ["adults must be an integer between 1 and 9", "options"],
    ["currency must be a 3-letter code", "options"],
    ["limit must be an integer between 1 and 50", "options"],
    ["Body must be a JSON object", "general"],
    ["constructor must not resolve to a prototype key", "general"],
  ])("puts %j under %s", (message, field) => {
    expect(fieldForError(message)).toBe(field);
  });
});

describe("errorsByField", () => {
  it("groups messages per control in order and capitalises them", () => {
    expect(
      errorsByField(["earliest must not be in the past", "maxNights must not be below minNights", "latest must not be before earliest"]),
    ).toEqual({
      dates: ["Earliest must not be in the past", "Latest must not be before earliest"],
      nights: ["MaxNights must not be below minNights"],
    });
  });
});
