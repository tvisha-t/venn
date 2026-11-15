import { describe, expect, it } from "vitest";
import { checkPassword, hashPassword, validatePassword } from "@/server/passwords";

describe("password hashing", () => {
  it("stores a salted scrypt hash, never the password", async () => {
    const a = await hashPassword("correct horse battery");
    const b = await hashPassword("correct horse battery");
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(a).not.toContain("correct horse");
    expect(a).not.toBe(b); // different salt each time
  });
  it("accepts the right password and rejects others", async () => {
    const h = await hashPassword("correct horse battery");
    expect(await checkPassword("correct horse battery", h)).toBe(true);
    expect(await checkPassword("correct horse batterY", h)).toBe(false);
    expect(await checkPassword("", h)).toBe(false);
    expect(await checkPassword("anything", "garbage")).toBe(false);
  });
  it("requires at least 8 characters", () => {
    expect(() => validatePassword("short")).toThrow(/at least 8/);
    expect(() => validatePassword("long enough")).not.toThrow();
  });
});
