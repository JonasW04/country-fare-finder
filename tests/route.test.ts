import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as health } from "@/app/api/health/route";
import { GET, POST } from "@/app/api/search/route";
import { addDays } from "@/lib/dates";

const today = new Date().toISOString().slice(0, 10);
const query = (extra = "") =>
  `origin=LHR&country=IT&earliest=${addDays(today, 30)}&latest=${addDays(today, 34)}&minNights=5&maxNights=7${extra}`;

beforeEach(() => {
  vi.stubEnv("FLIGHT_PROVIDER", "mock");
  vi.stubEnv("MAX_PROVIDER_CALLS", "200");
});
afterEach(() => vi.unstubAllEnvs());

describe("/api/search", () => {
  it("returns ranked combinations from the mock provider", async () => {
    const res = await GET(new Request(`http://test/api/search?${query()}`));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.provider.name).toBe("mock");
    expect(body.providerCalls).toBeGreaterThan(0);
    expect(body.combinations.length).toBeGreaterThan(0);
    expect(body.combinations[0].rank).toBe(1);
    const totals: number[] = body.combinations.map((c: { total: number }) => c.total);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
  });

  it("accepts a JSON body", async () => {
    const params = Object.fromEntries(new URLSearchParams(query("&limit=3")));
    const res = await POST(new Request("http://test/api/search", { method: "POST", body: JSON.stringify(params) }));
    expect(res.status).toBe(200);
    expect((await res.json()).combinations.length).toBeLessThanOrEqual(3);
  });

  it("rejects invalid input with 400 and messages", async () => {
    const res = await GET(new Request("http://test/api/search?origin=X&country=ZZ"));
    expect(res.status).toBe(400);
    expect((await res.json()).errors.length).toBeGreaterThan(0);
  });
});

describe("/api/health", () => {
  it("reports provider and credential presence as a boolean only", async () => {
    vi.stubEnv("IGNAV_API_KEY", "do-not-leak");
    const body = await (await health()).json();
    expect(body).toMatchObject({ status: "ok", provider: "mock", credentialsPresent: expect.any(Boolean) });
    expect(JSON.stringify(body)).not.toContain("do-not-leak");
  });
});
