import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/server/db";
import { resetDatabase, seedAll } from "@/server/seed";
import { parseGoal, parseGoalRules } from "@/server/agent/parse";
import { getVocab, clearVocabCache } from "@/server/agent/vocab";
import { searchProfiles } from "@/server/agent/search";
import { rankMatches } from "@/server/agent/rank";
import { runGoal, type AgentEvent } from "@/server/agent/orchestrator";
import { llmPayloadLog } from "@/server/agent/llm";
import { draftIntro, rewriteIntro } from "@/server/agent/draft";
import { getPublicProfile } from "@/server/profiles";

let student: string;

beforeAll(async () => {
  await resetDatabase();
  await seedAll();
  clearVocabCache();
  const [s] = await sql`select id from profiles where status='claimed' and 'student' = any(roles) and not ferpa_restricted order by last_name limit 1`;
  student = s.id;
});

const sender = { roles: ["student"], major: "Computer Science", classYear: 2028, employer: null, jobTitle: null, city: "Atlanta" };

describe("agent (rule-based fallback, no API key)", () => {
  it("parse_goal falls back to rules when the LLM is unavailable", async () => {
    const g = await parseGoal("GT alumni at Delta who could give advice on ops tech", sender);
    expect(g.source).toBe("rules");
    expect(g.filters.employers).toContain("Delta Air Lines");
    expect(g.filters.roles).toContain("alum");
    expect(g.intent).toBe("get_advice");
  });

  it("recognizes programs and cofounder intent", async () => {
    const g = parseGoalRules("a technical cofounder who did CREATE-X", await getVocab());
    expect(g.intent).toBe("cofounder");
    expect(g.filters.gt_programs).toEqual(["CREATE-X"]);
    expect(g.filters.open_to).toContain("cofounding");
  });

  it("asks a clarifying question for a vague goal", async () => {
    const g = parseGoalRules("help", await getVocab());
    expect(g.intent).toBe("other");
    expect(g.clarifying_question).toBeTruthy();
  });

  it("search returns only matching, visible people and never the sender", async () => {
    const g = await parseGoal("GT alumni at Delta who could give advice on ops tech", sender);
    const { candidates } = await searchProfiles(g, student);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) => c.employer === "Delta Air Lines" && c.roles.includes("alum"))).toBe(true);
    expect(candidates.some((c) => c.id === student)).toBe(false);
    expect(JSON.stringify(candidates)).not.toMatch(/@/);
  });

  it("loosens filters in order when nothing matches, and says what it relaxed", async () => {
    const vocab = await getVocab();
    const g = parseGoalRules("alumni at Delta in Seattle", vocab);
    g.filters.cities = ["Seattle"];
    g.filters.class_year_min = 1950; g.filters.class_year_max = 1951;
    const { candidates, relaxed } = await searchProfiles(g, student);
    expect(candidates.length).toBeGreaterThan(0);
    expect(relaxed.slice(0, 2)).toEqual(["city", "class years"]);
  });

  it("rank fallback gives every match a factual reason ≤ 12 words", async () => {
    const g = await parseGoal("people in fintech open to mentoring", sender);
    const { candidates } = await searchProfiles(g, student);
    const r = await rankMatches(g, candidates, 12);
    expect(r.source).toBe("rules");
    expect(r.matches.length).toBeGreaterThan(0);
    for (const m of r.matches) expect(m.reason.split(/\s+/).length).toBeLessThanOrEqual(12);
  });

  it("orchestrator streams steps in order and stores the goal", async () => {
    const events: AgentEvent[] = [];
    const id = await runGoal("GT alumni at Delta who could give advice on ops tech", student, (e) => events.push(e));
    expect(id).toBeTruthy();
    const steps = events.filter((e) => e.type === "step" && e.status === "done").map((e) => (e as { id: string }).id);
    expect(steps).toEqual(["parse", "search", "rank", "ready"]);
    const result = events.find((e) => e.type === "result") as Extract<AgentEvent, { type: "result" }>;
    expect(result.matches.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toMatch(/@/);
  });

  it("template drafts stay under 120 words and contain no contact data or links", async () => {
    const me = (await getPublicProfile(student))!;
    const [r] = await sql`select id from profiles where status='unclaimed' and employer is not null limit 1`;
    const rec = (await getPublicProfile(r.id))!;
    const d = await draftIntro(me, rec, { raw: "advice on breaking into product management", ask: "15-min advice call" });
    expect(d.body.split(/\s+/).length).toBeLessThanOrEqual(120);
    expect(d.body).not.toMatch(/@|https?:/);
    expect(d.body).toContain(rec.firstName);
    const shorter = await rewriteIntro(d, "shorter", me);
    expect(shorter.body.split(/\s+/).length).toBeLessThan(d.body.split(/\s+/).length);
  });

  it("LLM payloads never contain contact data", () => {
    expect(llmPayloadLog.length).toBeGreaterThan(0);
    for (const p of llmPayloadLog) {
      expect(p).not.toMatch(/[^\s@"]+@[^\s@"]+\.[a-z]{2,}/i);
      expect(p).not.toMatch(/email_primary|email_emfl_alias|login_email|preferred_email/);
    }
  });
});
