import { describe, expect, it } from "vitest";
import { domainMatches, maskEmail, normalizeEmail, schoolForEmail } from "@/lib/schoolDomain";

describe("schoolForEmail (school-email verification)", () => {
  const gt = (e: string) => schoolForEmail(e)?.slug ?? null;

  it("accepts Georgia Tech addresses", () => {
    expect(gt("olivia@gatech.edu")).toBe("gatech");
    expect(gt("OLIVIA@GaTech.EDU ")).toBe("gatech"); // trim + lowercase
    expect(gt("x@cc.gatech.edu")).toBe("gatech");     // true subdomain
  });

  it("rejects lookalikes and other domains", () => {
    expect(gt("x@evilgatech.edu")).toBeNull();
    expect(gt("x@gatech.edu.evil.com")).toBeNull();
    expect(gt("x@gmail.com")).toBeNull();
    expect(gt("x@gatech.edu@gmail.com")).toBeNull(); // fails the shape check
    expect(gt("x@emory.edu")).toBeNull();             // generic .edu does not unlock GT
    expect(gt("")).toBeNull();
    expect(gt("no-at-sign.gatech.edu")).toBeNull();
  });

  it("matches exact domains and true subdomains only", () => {
    expect(domainMatches("gatech.edu", "gatech.edu", false)).toBe(true);
    expect(domainMatches("cc.gatech.edu", "gatech.edu", false)).toBe(false);
    expect(domainMatches("cc.gatech.edu", "gatech.edu", true)).toBe(true);
    expect(domainMatches("xgatech.edu", "gatech.edu", true)).toBe(false);
  });

  it("normalizes and masks", () => {
    expect(normalizeEmail("  A.B@GATECH.EDU ")).toBe("a.b@gatech.edu");
    expect(normalizeEmail("a b@gatech.edu")).toBeNull();
    expect(maskEmail("olivia@gatech.edu")).toBe("o•••a@gatech.edu");
  });
});
