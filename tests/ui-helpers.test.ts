import { describe, expect, it } from "vitest";
import { inTwoWeeks, localToday, nextMonth, nextWeekend, surpriseWindow } from "@/app/lib/date-presets";
import { flagEmoji } from "@/app/lib/flags";
import { formatDay, formatMoney, formatSpan } from "@/app/lib/format";
import { bearingDeg, edgePoint, pinToFrame, splitOutliers } from "@/app/lib/map-geometry";
import { priceColor, priceRatio } from "@/app/lib/price-scale";
import { openJawSaving, visibleTrips } from "@/app/lib/results";
import { defaultForm, formFromParams, originCodeFromText, paramsFromForm } from "@/app/lib/search-form";
import type { Combination } from "@/lib/ranking";

function combo(rank: number, inMetro: string, outMetro: string, total: number, nights = 5): Combination {
  const leg = { origin: "OSL", destination: inMetro, date: "2026-11-12", price: total / 2, currency: "EUR", carriers: [] };
  return {
    rank,
    origin: "OSL",
    flyIn: { iata: inMetro, city: inMetro, metro: inMetro },
    flyOut: { iata: outMetro, city: outMetro, metro: outMetro },
    total,
    currency: "EUR",
    nights,
    openJaw: inMetro !== outMetro,
    outbound: leg,
    inbound: { ...leg, origin: outMetro, destination: "OSL" },
  };
}

describe("date presets", () => {
  it("picks the Friday of the next weekend that is at least two days away", () => {
    // 2026-10-18 is a Sunday, 2026-10-22 a Thursday.
    expect(nextWeekend("2026-10-18")).toEqual({ earliest: "2026-10-23", latest: "2026-10-24", nights: { min: 2, max: 3 } });
    expect(nextWeekend("2026-10-22").earliest).toBe("2026-10-30");
  });

  it("covers the whole next month, across a year end", () => {
    expect(nextMonth("2026-10-18")).toEqual({ earliest: "2026-11-01", latest: "2026-11-30" });
    expect(nextMonth("2026-12-05")).toEqual({ earliest: "2027-01-01", latest: "2027-01-31" });
  });

  it("starts in two weeks for a week", () => {
    expect(inTwoWeeks("2026-10-18")).toEqual({ earliest: "2026-11-01", latest: "2026-11-07" });
  });

  it("keeps a surprise window between three and six weeks out", () => {
    expect(surpriseWindow("2026-10-18", () => 0)).toEqual({ earliest: "2026-11-08", latest: "2026-11-15" });
    expect(surpriseWindow("2026-10-18", () => 0.999).latest).toBe("2026-11-29");
  });

  it("reads today from local calendar fields", () => {
    expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});

describe("formatting", () => {
  it("formats days, spans and money", () => {
    expect(formatDay("2026-11-12")).toBe("Thu 12 Nov");
    expect(formatSpan("2026-11-10", "2026-11-14")).toBe("10 to 14 Nov");
    expect(formatSpan("2026-11-28", "2026-12-03")).toBe("28 Nov to 3 Dec");
    expect(formatMoney(14.99, "EUR")).toBe("€14.99");
    expect(formatMoney(23.4, "EUR", true)).toBe("€23");
  });

  it("builds flag emoji from ISO codes", () => {
    expect(flagEmoji("it")).toBe("🇮🇹");
    expect(flagEmoji("ITA")).toBe("");
  });
});

describe("price scale", () => {
  it("runs from mint at the cheapest to sunset at the dearest", () => {
    expect(priceColor(10, 10, 50)).toBe("#2bd4a4");
    expect(priceColor(50, 10, 50)).toBe("#ff6b3d");
    expect(priceColor(30, 10, 50)).toBe("#ffc94d");
    expect(priceColor(99, 10, 50)).toBe("#ff6b3d");
  });

  it("treats a single price as the cheapest", () => {
    expect(priceRatio(20, 20, 20)).toBe(0);
  });
});

describe("map geometry", () => {
  const mainland = [
    { lat: 40.64, lon: -73.78 },
    { lat: 33.94, lon: -118.41 },
    { lat: 41.98, lon: -87.9 },
    { lat: 25.79, lon: -80.29 },
    { lat: 47.45, lon: -122.31 },
    { lat: 32.9, lon: -97.04 },
    { lat: 39.86, lon: -104.67 },
    { lat: 33.64, lon: -84.43 },
  ];
  const hawaii = [
    { lat: 21.32, lon: -157.92 },
    { lat: 20.9, lon: -156.43 },
  ];
  const alaska = [{ lat: 61.17, lon: -150.0 }];

  it("frames the US mainland and leaves Hawaii and Alaska out", () => {
    const { framed, outliers } = splitOutliers([...mainland, ...hawaii, ...alaska]);
    expect(framed).toEqual(mainland);
    expect(outliers).toEqual([...hawaii, ...alaska]);
  });

  it("keeps every airport of a compact country", () => {
    const nl = [
      { lat: 52.31, lon: 4.76 },
      { lat: 51.95, lon: 4.44 },
      { lat: 51.45, lon: 5.37 },
      { lat: 50.91, lon: 5.77 },
      { lat: 53.12, lon: 6.58 },
    ];
    expect(splitOutliers(nl).outliers).toEqual([]);
  });

  it("points from Italy towards Oslo roughly north", () => {
    const b = bearingDeg({ lat: 42.5, lon: 12.5 }, { lat: 60.2, lon: 11.1 });
    expect(b > 355 || b < 5).toBe(true);
  });

  it("finds where a bearing leaves the frame", () => {
    expect(edgePoint([50, 50], 0, 100, 100, 10)).toEqual([50, 10]);
    const east = edgePoint([50, 50], 90, 100, 100, 10);
    expect(east[0]).toBeCloseTo(90);
    expect(east[1]).toBeCloseTo(50);
  });

  it("pins an off-map point to the edge on its own side", () => {
    expect(pinToFrame([50, 50], 100, 100, 10)).toEqual([50, 50]);
    const pinned = pinToFrame([-200, 50], 100, 100, 10);
    expect(pinned[0]).toBeCloseTo(10);
    expect(pinned[1]).toBeCloseTo(50);
  });
});

describe("search form", () => {
  it("round-trips through URL params", () => {
    const form = { ...defaultForm("2026-10-18", "IT"), origin: "OSL" };
    const params = Object.fromEntries(paramsFromForm(form));
    expect(params.secondOrigin).toBeUndefined();
    expect(formFromParams(params, defaultForm("2026-10-18", "ES"))).toEqual(form);
  });

  it("reads an origin code from typed text or a picked label", () => {
    expect(originCodeFromText(" stn ")).toBe("STN");
    expect(originCodeFromText("Oslo · OSL")).toBe("OSL");
    expect(originCodeFromText("Oslo")).toBe("");
  });
});

describe("results", () => {
  it("reports the open-jaw saving against the best round trip", () => {
    const saving = openJawSaving([combo(1, "BLQ", "TRN", 40), combo(2, "BLQ", "BLQ", 63)]);
    expect(saving?.amount).toBe(23);
    expect(saving?.openJaw.flyIn.city).toBe("BLQ");
  });

  it("has no saving when the round trip is cheaper or missing", () => {
    expect(openJawSaving([combo(1, "BLQ", "BLQ", 30), combo(2, "BLQ", "TRN", 40)])).toBeNull();
    expect(openJawSaving([combo(1, "BLQ", "TRN", 40)])).toBeNull();
  });

  it("filters by trip kind and city and sorts by nights", () => {
    const trips = [combo(1, "BLQ", "TRN", 40, 7), combo(2, "BLQ", "BLQ", 50, 4), combo(3, "PSA", "PSA", 60, 4)];
    expect(visibleTrips(trips, "same-city", "price", null).map((c) => c.rank)).toEqual([2, 3]);
    expect(visibleTrips(trips, "all", "nights", null).map((c) => c.rank)).toEqual([2, 3, 1]);
    expect(visibleTrips(trips, "all", "price", "TRN").map((c) => c.rank)).toEqual([1]);
  });
});
