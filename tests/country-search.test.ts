import { describe, expect, it } from "vitest";
import { matchCountries } from "@/app/lib/country-search";

const countries = [
  { code: "GB", name: "United Kingdom" },
  { code: "IT", name: "Italy" },
  { code: "MR", name: "Mauritania" },
  { code: "ES", name: "Spain" },
];

describe("matchCountries", () => {
  it("lists every country for empty text", () => {
    expect(matchCountries(countries, "  ")).toHaveLength(4);
  });

  it("puts names starting with the text before names containing it", () => {
    expect(matchCountries(countries, "Ita").map((c) => c.code)).toEqual(["IT", "MR"]);
  });

  it("matches an exact ISO code", () => {
    expect(matchCountries(countries, "gb").map((c) => c.code)).toEqual(["GB"]);
  });

  it("returns nothing when no name matches", () => {
    expect(matchCountries(countries, "zz")).toEqual([]);
  });
});
