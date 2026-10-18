import { describe, expect, it } from "vitest";
import { OfferStore, estimateLegsToVerify, exactReplacements, rankCombinations, replaceEstimates } from "@/lib/ranking";
import { sampleDates } from "@/lib/dates";
import { airport, offer } from "./helpers";

const airports = [
  airport("FCO", "Rome"),
  airport("VCE", "Venice"),
  airport("MXP", "Milan", "MIL"),
  airport("LIN", "Milan", "MIL"),
  airport("BGY", "Milan", "MIL"),
];

const base = { airports, currency: "EUR", minNights: 5, maxNights: 10, limit: 10 };

describe("rankCombinations", () => {
  it("prefers an open jaw when it is cheaper than the best round trip", () => {
    const outbound = [offer("MAD", "FCO", "2027-03-01", 100), offer("MAD", "VCE", "2027-03-01", 150)];
    const inbound = [offer("FCO", "MAD", "2027-03-08", 200), offer("VCE", "MAD", "2027-03-08", 60)];
    const { combinations } = rankCombinations({ ...base, outbound, inbound });

    expect(combinations[0]).toMatchObject({ total: 160, openJaw: true });
    expect(combinations[0]?.flyIn.city).toBe("Rome");
    expect(combinations[0]?.flyOut.city).toBe("Venice");
    const roundTrip = combinations.find((c) => c.flyIn.city === "Rome" && c.flyOut.city === "Rome");
    expect(roundTrip).toMatchObject({ total: 300, openJaw: false });
  });

  it("counts airports of one metro once, represented by the cheapest sibling", () => {
    const outbound = [
      offer("MAD", "MXP", "2027-03-01", 120),
      offer("MAD", "LIN", "2027-03-01", 90),
      offer("MAD", "BGY", "2027-03-01", 70),
    ];
    const inbound = [offer("MXP", "MAD", "2027-03-08", 50), offer("BGY", "MAD", "2027-03-08", 80)];
    const { combinations } = rankCombinations({ ...base, outbound, inbound });

    expect(combinations).toHaveLength(1);
    expect(combinations[0]).toMatchObject({ total: 120, openJaw: false });
    expect(combinations[0]?.outbound.destination).toBe("BGY");
    expect(combinations[0]?.inbound.origin).toBe("MXP");
  });

  it("returns nothing for empty input", () => {
    expect(rankCombinations({ ...base, outbound: [], inbound: [] })).toEqual({ combinations: [], citiesWithoutReturn: [] });
  });

  it("handles a single-airport country", () => {
    const outbound = [offer("MAD", "FCO", "2027-03-01", 100)];
    const inbound = [offer("FCO", "MAD", "2027-03-07", 90)];
    const { combinations } = rankCombinations({ ...base, airports: [airport("FCO", "Rome")], outbound, inbound });
    expect(combinations).toHaveLength(1);
    expect(combinations[0]).toMatchObject({ rank: 1, total: 190, nights: 6, openJaw: false });
  });

  it("reports cities with no usable return leg and still ranks the rest", () => {
    const outbound = [offer("MAD", "FCO", "2027-03-01", 100), offer("MAD", "VCE", "2027-03-01", 50)];
    const inbound = [offer("FCO", "MAD", "2027-03-08", 100)];
    const { combinations, citiesWithoutReturn } = rankCombinations({ ...base, outbound, inbound });

    expect(combinations.map((c) => `${c.flyIn.city}>${c.flyOut.city}`)).toEqual(["Venice>Rome", "Rome>Rome"]);
    expect(citiesWithoutReturn).toEqual([]);
    const noReturns = rankCombinations({ ...base, outbound, inbound: [] });
    expect(noReturns.combinations).toEqual([]);
    expect(noReturns.citiesWithoutReturn).toEqual(["Rome", "Venice"]);
  });

  it("drops return legs outside the trip length", () => {
    const outbound = [offer("MAD", "FCO", "2027-03-01", 100)];
    const tooShort = [offer("FCO", "MAD", "2027-03-03", 10)];
    const tooLong = [offer("FCO", "MAD", "2027-03-20", 10)];
    expect(rankCombinations({ ...base, outbound, inbound: [...tooShort, ...tooLong] }).combinations).toEqual([]);
  });

  it("breaks equal totals by city name, not input order", () => {
    const outbound = [offer("MAD", "VCE", "2027-03-01", 100), offer("MAD", "FCO", "2027-03-01", 100)];
    const inbound = [offer("VCE", "MAD", "2027-03-08", 100), offer("FCO", "MAD", "2027-03-08", 100)];
    const forward = rankCombinations({ ...base, outbound, inbound }).combinations;
    const reversed = rankCombinations({ ...base, outbound: [...outbound].reverse(), inbound: [...inbound].reverse() }).combinations;

    const names = (cs: typeof forward) => cs.map((c) => `${c.flyIn.city}>${c.flyOut.city}`);
    expect(names(forward)).toEqual(["Rome>Rome", "Rome>Venice", "Venice>Rome", "Venice>Venice"]);
    expect(names(reversed)).toEqual(names(forward));
  });

  it("ignores offers in another currency and honours the limit", () => {
    const outbound = [offer("MAD", "FCO", "2027-03-01", 10, { currency: "USD" }), offer("MAD", "VCE", "2027-03-01", 100)];
    const inbound = [offer("FCO", "MAD", "2027-03-08", 10), offer("VCE", "MAD", "2027-03-08", 100)];
    const { combinations } = rankCombinations({ ...base, outbound, inbound, limit: 1 });
    expect(combinations).toHaveLength(1);
    expect(combinations[0]?.flyIn.city).toBe("Venice");
  });

  it("keeps origins separate", () => {
    const outbound = [offer("MAD", "FCO", "2027-03-01", 100), offer("BCN", "FCO", "2027-03-01", 40)];
    const inbound = [offer("FCO", "MAD", "2027-03-08", 100), offer("FCO", "BCN", "2027-03-08", 40)];
    const { combinations } = rankCombinations({ ...base, outbound, inbound });
    expect(combinations.map((c) => [c.origin, c.total])).toEqual([["BCN", 80], ["MAD", 200]]);
  });
});

describe("OfferStore", () => {
  it("caps stored offers per city and keeps the cheapest", () => {
    const store = new OfferStore(airports, 3);
    for (const price of [90, 10, 50, 70, 30]) store.add("out", offer("MAD", "FCO", "2027-03-01", price));
    expect(store.offers("out").map((o) => o.price)).toEqual([10, 30, 50]);
  });

  it("shares one cap across the airports of a metro", () => {
    const store = new OfferStore(airports, 2);
    store.add("out", offer("MAD", "MXP", "2027-03-01", 30));
    store.add("out", offer("MAD", "LIN", "2027-03-01", 10));
    store.add("out", offer("MAD", "BGY", "2027-03-01", 20));
    expect(store.offers("out").map((o) => o.destination)).toEqual(["LIN", "BGY"]);
  });

  it("ignores unknown airports and invalid prices", () => {
    const store = new OfferStore(airports);
    store.add("out", offer("MAD", "ZZZ", "2027-03-01", 10));
    store.add("out", offer("MAD", "FCO", "2027-03-01", Number.NaN));
    expect(store.offers("out")).toEqual([]);
  });
});

describe("sampleDates", () => {
  const days = ["d0", "d1", "d2", "d3", "d4", "d5", "d6"];
  it("takes both ends first, then the middle", () => {
    expect(sampleDates(days, 3)).toEqual(["d0", "d6", "d3"]);
    expect(sampleDates(days, 1)).toEqual(["d0"]);
    expect(sampleDates(["d0"], 3)).toEqual(["d0"]);
    expect(sampleDates([], 3)).toEqual([]);
  });
});

describe("exact re-check of estimate legs", () => {
  const est = (from: string, to: string, date: string, price: number) => offer(from, to, date, price, { estimate: true, carriers: [] });

  it("picks the unique estimate legs of the top combinations that have one", () => {
    const outbound = [est("MAD", "FCO", "2027-03-01", 10), offer("MAD", "VCE", "2027-03-01", 15)];
    const inbound = [est("FCO", "MAD", "2027-03-08", 10), offer("VCE", "MAD", "2027-03-08", 12)];
    const { combinations } = rankCombinations({ ...base, outbound, inbound });
    const legs = estimateLegsToVerify(combinations, 2);
    expect(legs.map((l) => `${l.origin}-${l.destination}`)).toEqual(["MAD-FCO", "FCO-MAD"]);
    expect(estimateLegsToVerify(combinations, 0)).toEqual([]);
  });

  it("swaps an estimate for the cheapest exact quote of the same leg, even a dearer one", () => {
    const exact = exactReplacements(
      [
        offer("MAD", "FCO", "2027-03-01", 140),
        offer("MAD", "FCO", "2027-03-01", 120),
        offer("MAD", "FCO", "2027-03-02", 50),
        offer("MAD", "FCO", "2027-03-01", 30, { currency: "USD" }),
        est("MAD", "FCO", "2027-03-01", 5),
      ],
      "EUR",
    );
    const outbound = replaceEstimates([est("MAD", "FCO", "2027-03-01", 20), est("MAD", "VCE", "2027-03-01", 60)], exact);
    expect(outbound.map((o) => [o.price, Boolean(o.estimate)])).toEqual([
      [120, false],
      [60, true],
    ]);

    const inbound = [offer("FCO", "MAD", "2027-03-08", 10), offer("VCE", "MAD", "2027-03-08", 10)];
    const { combinations } = rankCombinations({ ...base, outbound, inbound });
    // Rome led on its calendar low; its exact quote drops it behind Venice.
    expect(combinations.map((c) => c.flyIn.city)).toEqual(["Venice", "Venice", "Rome", "Rome"]);
  });
});
