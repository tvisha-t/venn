import { describe, expect, it } from "vitest";
import { geocode, placeFor } from "@/server/geo";

describe("placing members on the map", () => {
  it("uses a known city", () => {
    expect(placeFor("Atlanta", "GA")).toMatchObject({ lat: expect.closeTo(33.75, 0) });
  });
  it("falls back to the state's main metro for an unlisted city (code or full name)", () => {
    expect(placeFor("Plymouth", "MN")).toEqual({ lat: 44.98, lng: -93.27 });
    expect(placeFor("Plymouth", "Minnesota")).toEqual({ lat: 44.98, lng: -93.27 });
  });
  it("returns nothing when neither city nor state is known", () => {
    expect(placeFor("Atlantis", null)).toBeUndefined();
    expect(geocode("Atlantis", "ZZ", "seed")).toEqual({ lat: null, lng: null });
  });
  it("jitters and rounds to ~1 km (2 decimals) and is stable per person", () => {
    const a = geocode("Plymouth", "MN", "person-1");
    expect(a).toEqual(geocode("Plymouth", "MN", "person-1"));
    expect(String(a.lat).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(2);
    expect(Math.abs(a.lat! - 44.98)).toBeLessThan(0.05);
  });
});
