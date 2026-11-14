import { describe, expect, it } from "vitest";
import { goingPhrase, sharedCount, topOverlaps, type OverlapPerson } from "@/lib/eventPhrase";

const P = (id: string, firstName: string, o: Partial<OverlapPerson> = {}): OverlapPerson => ({
  id, firstName, activities: [], gtPrograms: [], csThreads: [], major: null, interests: [], ...o,
});
const me = P("me", "Alex", { activities: ["RoboJackets", "HackGT"], gtPrograms: ["CREATE-X"], major: "Computer Science", interests: ["fintech"] });

describe("event 'you'll know' phrase", () => {
  it("names the strongest overlap and counts others sharing the same item", () => {
    const people = [P("1", "Maya", { activities: ["RoboJackets"] }), P("2", "Jo", { activities: ["RoboJackets"] }), P("3", "Ben", { activities: ["robojackets"] }), P("4", "Kim")];
    expect(goingPhrase(me, people)).toBe("Maya + 2 from RoboJackets");
    expect(sharedCount(me, people)).toBe(3);
  });

  it("uses 'also into' for a lone shared interest and 'from' for a lone club/major", () => {
    expect(goingPhrase(me, [P("1", "Sara", { interests: ["Fintech"] })])).toBe("Sara, also into Fintech");
    expect(goingPhrase(me, [P("1", "Dev", { major: "Computer Science" })])).toBe("Dev, from CS");
  });

  it("never invents overlap: no shared item means no phrase", () => {
    expect(goingPhrase(me, [P("1", "Kim", { activities: ["Glee"] }), P("2", "Lee")])).toBeNull();
    expect(goingPhrase(null, [P("1", "Maya", { activities: ["RoboJackets"] })])).toBeNull();
    expect(goingPhrase(me, [])).toBeNull();
  });

  it("ignores the viewer in the attendee list", () => {
    expect(goingPhrase(me, [me])).toBeNull();
    expect(topOverlaps(me, [me, P("1", "Maya", { activities: ["HackGT"] })]).map((x) => x.id)).toEqual(["1"]);
  });

  it("ranks 'you'll know' by overlap strength and caps at 3", () => {
    const people = [
      P("a", "A", { interests: ["fintech"] }),
      P("b", "B", { activities: ["RoboJackets"], gtPrograms: ["CREATE-X"] }),
      P("c", "C", { major: "Computer Science" }),
      P("d", "D", { activities: ["HackGT"] }),
    ];
    const top = topOverlaps(me, people);
    expect(top.map((x) => x.id)).toEqual(["b", "d", "c"]);
    expect(top[0].item).toBe("RoboJackets");
    expect(top[2].item).toBe("CS");
  });
});
