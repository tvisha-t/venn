// "Who you'll know" at an event, from REAL overlap only (same rules as the match overlap:
// clubs → programs → major → CS threads; plus shared interests for "also into").
// Pure functions: used server-side, and unit-tested without a database.

export type OverlapPerson = {
  id: string;
  firstName: string;
  activities: string[];
  gtPrograms: string[];
  csThreads: string[];
  major: string | null;
  interests: string[];
};

const norm = (s: string) => s.trim().toLowerCase();
const has = (list: string[], x: string) => list.some((y) => norm(y) === norm(x));

/** Shared items between the viewer and one person, most specific first, with a strength score. */
export function sharedItems(me: OverlapPerson, p: OverlapPerson): { item: string; kind: "club" | "program" | "major" | "thread" | "interest"; weight: number }[] {
  const out: { item: string; kind: "club" | "program" | "major" | "thread" | "interest"; weight: number }[] = [];
  for (const a of p.activities) if (has(me.activities, a)) out.push({ item: a, kind: "club", weight: 5 });
  for (const g of p.gtPrograms) if (has(me.gtPrograms, g)) out.push({ item: g, kind: "program", weight: 4 });
  if (p.major && me.major && norm(p.major) === norm(me.major)) out.push({ item: p.major, kind: "major", weight: 3 });
  for (const t of p.csThreads) if (has(me.csThreads, t)) out.push({ item: t, kind: "thread", weight: 2 });
  for (const i of p.interests) if (has(me.interests, i)) out.push({ item: i, kind: "interest", weight: 1 });
  return out;
}

export function overlapScore(me: OverlapPerson, p: OverlapPerson): number {
  return sharedItems(me, p).reduce((a, s) => a + s.weight, 0);
}

/** Short label for the shared item ("CS" for Computer Science, as in the mockups). */
function short(item: string) {
  return /^computer science$/i.test(item) ? "CS" : item;
}

/**
 * One phrase for an event row: the attendee with the strongest overlap, plus how many OTHER
 * attendees share that same item. "Maya + 2 from RoboJackets" / "Sara, also into fintech".
 * Returns null when nobody overlaps (never invents overlap).
 */
export function goingPhrase(me: OverlapPerson | null, attendees: OverlapPerson[]): string | null {
  if (!me) return null;
  let best: { p: OverlapPerson; top: ReturnType<typeof sharedItems>[number]; score: number } | null = null;
  for (const p of attendees) {
    if (p.id === me.id) continue;
    const items = sharedItems(me, p);
    if (!items.length) continue;
    const score = items.reduce((a, s) => a + s.weight, 0);
    if (!best || score > best.score) best = { p, top: items[0], score };
  }
  if (!best) return null;
  const { p, top } = best;
  const others = attendees.filter((a) => a.id !== p.id && a.id !== me.id && sharedItems(me, a).some((s) => norm(s.item) === norm(top.item))).length;
  if (others === 0) {
    return top.kind === "interest" ? `${p.firstName}, also into ${top.item}` : `${p.firstName}, from ${short(top.item)}`;
  }
  return `${p.firstName} + ${others} from ${short(top.item)}`;
}

/** Up to `n` attendees with the highest overlap, each with the one item to highlight. */
export function topOverlaps(me: OverlapPerson | null, attendees: OverlapPerson[], n = 3): { id: string; item: string }[] {
  if (!me) return [];
  return attendees
    .filter((p) => p.id !== me.id)
    .map((p) => ({ p, items: sharedItems(me, p) }))
    .filter((x) => x.items.length)
    .sort((a, b) => b.items.reduce((s, i) => s + i.weight, 0) - a.items.reduce((s, i) => s + i.weight, 0))
    .slice(0, n)
    .map((x) => ({ id: x.p.id, item: short(x.items[0].item) }));
}

/** How many attendees share at least one thing with the viewer ("9 you share something with"). */
export function sharedCount(me: OverlapPerson | null, attendees: OverlapPerson[]): number {
  if (!me) return 0;
  return attendees.filter((p) => p.id !== me.id && sharedItems(me, p).length > 0).length;
}
