import { describe, expect, it } from "vitest";
import { inTwoWeeks, localToday, nextMonth, nextWeekend, surpriseWindow } from "@/app/lib/date-presets";
import { flagEmoji } from "@/app/lib/flags";
import { formatDay, formatMoney, formatSpan, weekdayLetter } from "@/app/lib/format";
import { bearingDeg, edgePoint, pinToFrame, screenBearing, splitOutliers } from "@/app/lib/map-geometry";
import { placeLabels } from "@/app/lib/map-labels";
import { airportBox, applyTransform, fitTransform, projectBox } from "@/app/lib/map-view";
import { priceColor, priceRatio, priceTercile } from "@/app/lib/price-scale";
import { openJawSaving, visibleTrips } from "@/app/lib/results";
import { originCodeFromInput, originLabel } from "@/app/lib/origin-input";
import { defaultForm, formFromParams, paramsFromForm } from "@/app/lib/search-form";
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
    expect(formatSpan("2026-11-10", "2026-11-14")).toBe("10–14 Nov");
    expect(formatSpan("2026-11-28", "2026-12-03")).toBe("28 Nov – 3 Dec");
    expect(weekdayLetter("2026-11-12")).toBe("T");
    expect(formatMoney(14.99, "EUR")).toBe("€14.99");
    expect(formatMoney(23.4, "EUR", true)).toBe("€23");
  });

  it("builds flag emoji from ISO codes", () => {
    expect(flagEmoji("it")).toBe("🇮🇹");
    expect(flagEmoji("ITA")).toBe("");
  });
});

describe("price scale", () => {
  it("splits prices into terciles and only highlights the cheap third", () => {
    expect([10, 20, 30, 40, 50].map((v) => priceTercile(v, 10, 50))).toEqual([0, 0, 1, 2, 2]);
    expect(priceColor(10, 10, 50)).toBe("var(--color-accent)");
    expect(priceColor(30, 10, 50)).toBe("var(--color-subtle)");
    expect(priceColor(99, 10, 50)).toBe("var(--color-subtle)");
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

describe("map view", () => {
  const usMainland = [
    { lat: 40.64, lon: -73.78 },
    { lat: 33.94, lon: -118.41 },
    { lat: 41.98, lon: -87.9 },
    { lat: 25.79, lon: -80.29 },
    { lat: 47.45, lon: -122.31 },
    { lat: 32.9, lon: -97.04 },
    { lat: 39.86, lon: -104.67 },
    { lat: 33.64, lon: -84.43 },
  ];

  it("frames a country's airports without its far territories", () => {
    const box = airportBox([...usMainland, { lat: 21.32, lon: -157.92 }, { lat: 61.17, lon: -150 }]);
    expect(box).toEqual({ west: -122.31, south: 25.79, east: -73.78, north: 47.45 });
  });

  it("gives a one-airport country a box wide enough to see", () => {
    const box = airportBox([{ lat: 35.86, lon: 14.48 }]);
    expect(box?.east && box.west ? box.east - box.west : 0).toBeCloseTo(3);
    expect(airportBox([])).toBeNull();
  });

  it("samples box edges so a bulging projected edge is not cut off", () => {
    // A projection that bows the top edge upwards in the middle, like Equal Earth does to parallels.
    const bow = ([lon, lat]: [number, number]): [number, number] => [lon, 0 - lat - (lat === 10 ? 5 - Math.abs(lon - 5) : 0)];
    expect(projectBox(bow, { west: 0, south: 0, east: 10, north: 10 })).toEqual([
      [0, -15],
      [10, 0],
    ]);
  });

  it("fits and centres bounds in the frame", () => {
    const t = fitTransform([[0, 0], [100, 50]], 400, 400, 0);
    expect(t.k).toBe(4);
    expect(applyTransform(t, [50, 25])).toEqual([200, 200]);
  });

  it("measures on-screen direction clockwise from up", () => {
    expect(screenBearing([0, 0], [0, -1])).toBeCloseTo(0);
    expect(screenBearing([0, 0], [1, 0])).toBeCloseTo(90);
  });
});

describe("map labels", () => {
  it("keeps priority order, flips a crowded label left and drops one with no room", () => {
    const placed = placeLabels(
      [
        { id: "a", p: [100, 100], text: "Rome" },
        { id: "b", p: [110, 102], text: "Pisa" },
        { id: "c", p: [105, 101], text: "Ciampino" },
      ],
      8,
      400,
    );
    expect(placed).toEqual([
      { id: "a", side: "right" },
      { id: "b", side: "left" },
    ]);
  });

  it("flips a label left at the right edge and stops at the cap", () => {
    expect(placeLabels([{ id: "a", p: [395, 50], text: "Bari" }], 8, 400)).toEqual([{ id: "a", side: "left" }]);
    const many = Array.from({ length: 12 }, (_, i) => ({ id: String(i), p: [20, 20 + i * 30] as [number, number], text: "City" }));
    expect(placeLabels(many, 8, 400)).toHaveLength(8);
  });
});

describe("search form", () => {
  it("round-trips through URL params", () => {
    const form = { ...defaultForm("2026-10-18", "IT"), origin: "OSL" };
    const params = Object.fromEntries(paramsFromForm(form));
    expect(params.secondOrigin).toBeUndefined();
    expect(formFromParams(params, defaultForm("2026-10-18", "ES"))).toEqual(form);
  });

});

describe("origin input", () => {
  const oslo = { iata: "OSL", name: "Oslo-Gardermoen International Airport", city: "Oslo", country: "NO" };
  const torp = { iata: "TRF", name: "Sandefjord Airport, Torp", city: "Oslo", country: "NO" };
  const stansted = { iata: "STN", name: "London Stansted Airport", city: "London", country: "GB" };

  it("sends the code of a picked label, never the label", () => {
    expect(originCodeFromInput("Oslo · OSL", [])).toBe("OSL");
    expect(originCodeFromInput(originLabel(stansted), [])).toBe("STN");
  });

  it("resolves typed text to the matching or first suggestion", () => {
    expect(originCodeFromInput("oslo", [oslo, torp])).toBe("OSL");
    expect(originCodeFromInput("osl", [torp, oslo])).toBe("OSL");
    expect(originCodeFromInput("sandefjord", [torp])).toBe("TRF");
  });

  it("accepts a bare code before suggestions load and rejects other free text", () => {
    expect(originCodeFromInput(" stn ", [])).toBe("STN");
    expect(originCodeFromInput("Oslo", [])).toBe("");
  });

  it("labels an airport by its name when the name starts with the city", () => {
    expect(originLabel(stansted)).toBe("London Stansted · STN");
    expect(originLabel(oslo)).toBe("Oslo · OSL");
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
