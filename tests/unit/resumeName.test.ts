import { describe, expect, it } from "vitest";
import { cleanName, nameFromHeader } from "@/server/resume";

describe("name from a resume", () => {
  it("reads the name line at the top", () => {
    expect(nameFromHeader("Tvisha Talwar\n[email] | [phone]\nEDUCATION\nGeorgia Institute of Technology")).toEqual({ firstName: "Tvisha", lastName: "Talwar" });
    expect(nameFromHeader("\n  Mary Ann O'Neil-Smith  \nSoftware Engineer")).toEqual({ firstName: "Mary", lastName: "Ann O'Neil-Smith" });
  });
  it("skips headings and lines that aren't just a name", () => {
    expect(nameFromHeader("Curriculum Vitae\nJordan Lee\n")).toEqual({ firstName: "Jordan", lastName: "Lee" });
    expect(nameFromHeader("Software engineer at Delta, Atlanta GA")).toEqual({ firstName: null, lastName: null });
  });
  it("cleans names and rejects junk", () => {
    expect(cleanName("  Élodie  ")).toBe("Élodie");
    expect(cleanName("Sam <script>")).toBe("Sam script");
    expect(cleanName("1234")).toBeNull();
    expect(cleanName(null)).toBeNull();
  });
});
