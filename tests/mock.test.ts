import { describe, expect, it } from "vitest";
import { MockProvider } from "@/lib/providers/mock";
import type { OfferQuery } from "@/lib/providers/types";

const query: OfferQuery = { origin: "MAD", destination: "FCO", date: "2027-03-01", cabin: "ECONOMY", adults: 1, currency: "EUR" };

describe("MockProvider", () => {
  it("returns identical offers for identical queries, across instances", async () => {
    const a = await new MockProvider().searchOffers(query);
    const b = await new MockProvider().searchOffers(query);
    expect(a).toEqual(b);
  });

  it("varies by route and date", async () => {
    const provider = new MockProvider();
    const base = await provider.searchOffers(query);
    const otherDate = await provider.searchOffers({ ...query, date: "2027-03-02" });
    const otherRoute = await provider.searchOffers({ ...query, destination: "VCE" });
    expect(otherDate).not.toEqual(base);
    expect(otherRoute).not.toEqual(base);
  });

  it("returns well-formed offers sorted by price, in the requested currency", async () => {
    const offers = await new MockProvider().searchOffers({ ...query, currency: "USD" });
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      expect(o).toMatchObject({ origin: "MAD", destination: "FCO", date: "2027-03-01", currency: "USD" });
      expect(o.price).toBeGreaterThan(0);
      expect(o.carriers.length).toBeGreaterThan(0);
    }
    expect(offers.map((o) => o.price)).toEqual([...offers.map((o) => o.price)].sort((x, y) => x - y));
  });

  it("scales price with cabin and passengers, and passes unknown cabins through", async () => {
    const provider = new MockProvider();
    const [eco] = await provider.searchOffers(query);
    const [biz] = await provider.searchOffers({ ...query, cabin: "BUSINESS" });
    const [two] = await provider.searchOffers({ ...query, adults: 2 });
    const [odd] = await provider.searchOffers({ ...query, cabin: "SOMETHING_ELSE" });
    expect(biz?.price).toBeGreaterThan(eco?.price ?? Infinity);
    expect(two?.price).toBeCloseTo((eco?.price ?? 0) * 2, 1);
    expect(odd?.price).toBe(eco?.price);
  });
});
