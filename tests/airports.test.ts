import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/airports/route";
import {
  airportsForCountry,
  candidateAirports,
  findAirport,
  findAnyAirport,
  searchOrigins,
  supportedCountries,
} from "@/lib/airports";

describe("searchOrigins", () => {
  it("finds Málaga without the accent, in any case", () => {
    expect(searchOrigins("malaga")[0]?.iata).toBe("AGP");
    expect(searchOrigins("MÁLAGA")[0]?.iata).toBe("AGP");
  });

  it("puts the exact IATA match first, then the city prefix", () => {
    expect(searchOrigins("osl")[0]?.iata).toBe("OSL");
    expect(searchOrigins("oslo")[0]?.iata).toBe("OSL");
  });

  it("matches on the airport name and respects the limit", () => {
    expect(searchOrigins("heathrow").map((a) => a.iata)).toContain("LHR");
    expect(searchOrigins("a", 3)).toHaveLength(3);
    expect(searchOrigins("   ")).toEqual([]);
  });

  it("lets the larger airport win a tie", () => {
    // London City is a medium airport, so it must come after the large London airports.
    const codes = searchOrigins("london", 20).map((a) => a.iata);
    expect(codes).toContain("LCY");
    for (const large of ["LHR", "LGW", "STN", "LTN"]) {
      expect(codes.indexOf(large)).toBeLessThan(codes.indexOf("LCY"));
    }
  });
});

describe("findAnyAirport", () => {
  it("falls back to the worldwide list and carries coordinates", () => {
    const oslo = findAnyAirport("osl");
    expect(oslo?.lat).toBeGreaterThan(59);
    expect(oslo?.lon).toBeGreaterThan(10);
    expect(findAnyAirport("ZZZ")).toBeUndefined();
  });

  it("uses the traveller-facing city names", () => {
    expect(findAnyAirport("VRN")?.city).toBe("Verona");
    expect(findAirport("LYS")?.metroName).toBe("Lyon");
    expect(findAirport("LCG")?.city).toBe("A Coruña");
  });
});

describe("airport dataset", () => {
  it("keeps London airports in one metro", () => {
    const metros = new Set(["LHR", "LGW", "STN", "LTN", "LCY"].map((c) => findAirport(c)?.metro));
    expect([...metros]).toEqual(["LON"]);
  });

  it("covers every country with a scheduled airport and ranks the hand-kept ones busiest first", () => {
    expect(Object.keys(supportedCountries()).length).toBeGreaterThan(200);
    for (const country of ["ES", "IT", "PT", "FR", "GR", "TH", "DE", "GB", "NL", "HR", "NO", "SE", "TR", "US", "JP"]) {
      expect(airportsForCountry(country).some((a) => a.rank !== undefined), country).toBe(true);
      expect(candidateAirports(country, [], 1)[0]?.rank, country).toBe(1);
    }
  });
});

describe("/api/airports", () => {
  const get = (q: string) => GET(new Request(`http://test/api/airports?q=${encodeURIComponent(q)}`));

  it("returns an empty list for a one-character query", async () => {
    expect(await (await get("o")).json()).toEqual([]);
  });

  it("returns at most 8 matches with the lookup fields", async () => {
    const body = (await (await get("lon")).json()) as { iata: string }[];
    expect(body.length).toBeGreaterThan(0);
    expect(body.length).toBeLessThanOrEqual(8);
    expect(Object.keys(body[0] ?? {}).sort()).toEqual(["city", "country", "iata", "name"]);
  });
});
