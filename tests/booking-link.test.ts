import { describe, expect, it } from "vitest";
import { bookingLink, googleFlightsLink, googleFlightsTfs } from "@/lib/booking-link";

const leg = { origin: "STN", destination: "BLQ", date: "2026-11-12" };
const ctx = { adults: 1, cabin: "ECONOMY", currency: "EUR" };

describe("booking links", () => {
  it("encodes a one-way search exactly as the tfs that opened STN-BLQ results on Google Flights", () => {
    // Captured from a link checked by hand in a browser (English and Norwegian UI both showed results).
    expect(googleFlightsTfs("STN", "BLQ", "2026-11-12", 1, "ECONOMY")).toBe("CBwQAhoeEgoyMDI2LTExLTEyagcIARIDU1ROcgcIARIDQkxRQAFIAZgBAg");
  });

  it("repeats the passenger field per adult and maps the cabin to Google's seat enum", () => {
    const decoded = Buffer.from(googleFlightsTfs("STN", "BLQ", "2026-11-12", 3, "BUSINESS"), "base64url");
    const passengerFields = [...decoded].filter((b, i) => b === 0x40 && decoded[i + 1] === 0x01).length;
    expect(passengerFields).toBe(3);
    expect(decoded.includes(Buffer.from([0x48, 0x03]))).toBe(true);
  });

  it("links to the structured search page in the requested currency, never a free-text query", () => {
    const url = new URL(googleFlightsLink(leg, ctx));
    expect(url.origin + url.pathname).toBe("https://www.google.com/travel/flights/search");
    expect(url.searchParams.get("curr")).toBe("EUR");
    expect(url.searchParams.has("q")).toBe(false);
  });

  it("sends Ryanair fares to Ryanair's flight picker on the same route and day", () => {
    const url = new URL(bookingLink(leg, { ...ctx, adults: 2 }, "ryanair"));
    expect(url.hostname).toBe("www.ryanair.com");
    expect(url.searchParams.get("originIata")).toBe("STN");
    expect(url.searchParams.get("destinationIata")).toBe("BLQ");
    expect(url.searchParams.get("dateOut")).toBe("2026-11-12");
    expect(url.searchParams.get("adults")).toBe("2");
  });

  it("uses Google Flights for every other provider", () => {
    expect(bookingLink(leg, ctx, "ignav")).toContain("google.com/travel/flights/search?tfs=");
  });
});
