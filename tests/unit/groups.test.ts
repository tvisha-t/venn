import { describe, expect, it } from "vitest";
import { sharedGroups, suggestGroups, type GroupMembership, type OwnFields } from "@/lib/groupOverlap";
import { ALUMNI_ONLY_ROUTES, isAlum, isAlumniOnlyPath } from "@/lib/roles";

const G = (groupId: string, showOnProfile: boolean): GroupMembership => ({ groupId, name: groupId.toUpperCase(), showOnProfile });

describe("'You both' never uses private group memberships", () => {
  it("counts a group only when BOTH people show it", () => {
    expect(sharedGroups([G("band", true)], [G("band", true)])).toEqual(["BAND"]);
  });
  it("ignores it when either side keeps it private", () => {
    expect(sharedGroups([G("lavender", false)], [G("lavender", true)])).toEqual([]);
    expect(sharedGroups([G("lavender", true)], [G("lavender", false)])).toEqual([]);
    expect(sharedGroups([G("bao", false)], [G("bao", false)])).toEqual([]);
  });
  it("only shared groups, not everything either person is in", () => {
    expect(sharedGroups([G("band", true), G("crew", true)], [G("band", true), G("military", true)])).toEqual(["BAND"]);
  });
});

const F = (o: Partial<OwnFields> = {}): OwnFields => ({ activities: [], interests: [], gtPrograms: [], major: null, industry: null, jobTitle: null, employer: null, ...o });

describe("'Suggested for you' uses only what the member typed", () => {
  it("suggests from the member's own fields, with the private why", () => {
    const s = suggestGroups(F({ activities: ["Marching Band"], industry: "Real Estate" }));
    expect(s.map((x) => x.slug).sort()).toEqual(["band", "realestate"]);
    expect(s.find((x) => x.slug === "band")?.why).toContain("Marching Band");
  });
  it("never infers identity groups from clubs or language", () => {
    const s = suggestGroups(F({ activities: ["Chinese Student Association", "Women in Computing", "Black Student Union", "Spanish Club", "Pride Alliance"] }));
    expect(s.map((x) => x.slug)).not.toEqual(expect.arrayContaining(["chinese"]));
    for (const slug of ["chinese", "women", "bao", "hispanic", "lavender"]) expect(s.some((x) => x.slug === slug)).toBe(false);
  });
  it("first-gen only from an explicit statement", () => {
    expect(suggestGroups(F({ interests: ["first-gen college students"] })).some((x) => x.slug === "firstgen")).toBe(true);
    expect(suggestGroups(F({ activities: ["Tutoring"] })).some((x) => x.slug === "firstgen")).toBe(false);
  });
});

describe("alumni-only areas", () => {
  it("one list drives nav, pages and APIs", () => {
    expect(ALUMNI_ONLY_ROUTES).toEqual(["/events", "/groups"]);
    expect(isAlumniOnlyPath("/events/123")).toBe(true);
    expect(isAlumniOnlyPath("/groups/band")).toBe(true);
    expect(isAlumniOnlyPath("/explore")).toBe(false);
  });
  it("students aren't alumni; alumni (incl. student+alum) are", () => {
    expect(isAlum({ roles: ["student"] })).toBe(false);
    expect(isAlum({ roles: ["alum"] })).toBe(true);
    expect(isAlum({ roles: ["faculty", "alum"] })).toBe(true);
    expect(isAlum(null)).toBe(false);
  });
});
