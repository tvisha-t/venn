// Runs the agent tools in order and emits each step for the UI (§7).
// The agent never sends anything: send_intro requires an explicit user click (see intros.ts).
import { sql } from "../db";
import type { PublicProfile } from "../dto";
import { getOwnProfile, getPublicProfile } from "../profiles";
import { parseGoal, parseGoalRules, type ParsedGoal } from "./parse";
import { getVocab } from "./vocab";
import { countSearchable, findByName, searchProfiles, type Candidate } from "./search";
import { rankMatches } from "./rank";

export type AgentEvent =
  | { type: "step"; id: "parse" | "search" | "rank" | "ready"; label: string; status: "running" | "done" }
  | { type: "clarify"; question: string; explanation: string }
  | { type: "result"; goalId: string; explanation: string; understood: string[]; relaxed: string[]; matches: MatchView[]; usedFallback: boolean }
  | { type: "error"; message: string };

export type MatchView = { profile: PublicProfile; score: number; reason: string; rank: number; isNew?: boolean };

const fmt = (n: number) => n.toLocaleString("en-US");

const ROLE_WORD: Record<string, string> = { student: "Students", alum: "Alumni", faculty: "Faculty", staff: "Staff", lifetime_learner: "Lifetime learners" };

/** Short chips describing what the agent understood ("Venn understood: Alumni · Delta Air Lines · Advice call"). */
export function understoodChips(g: ParsedGoal): string[] {
  const f = g.filters;
  const years = f.class_year_min && f.class_year_max
    ? (f.class_year_min === f.class_year_max ? `Class of ${f.class_year_min}` : `Class of ${f.class_year_min}–${String(f.class_year_max).slice(2)}`)
    : f.class_year_min ? `Class of ${f.class_year_min}+` : f.class_year_max ? `Class of ≤${f.class_year_max}` : null;
  const chips = [
    ...f.roles.map((r) => ROLE_WORD[r] ?? r), ...f.employers, ...f.industries, ...f.gt_programs, ...f.majors, ...f.cities,
    years, ...f.open_to.map((o) => `Open to ${o}`), g.ask_type ? g.ask_type.charAt(0).toUpperCase() + g.ask_type.slice(1) : null,
  ].filter(Boolean) as string[];
  return Array.from(new Set(chips)).slice(0, 8);
}

export async function runGoal(raw: string, profileId: string, emit: (e: AgentEvent) => void, opts: { standing?: boolean } = {}) {
  const me = await getOwnProfile(profileId);

  // Looking for a specific person? A query that is just a member's name shows them directly.
  const named = await findByName(raw, profileId);
  if (named.length) {
    const label = `Looking up “${raw.trim()}”`;
    emit({ type: "step", id: "search", label, status: "running" });
    const parsed: ParsedGoal = { ...parseGoalRules(raw, await getVocab()), explanation: `People named “${raw.trim()}” on Venn.`, clarifying_question: null };
    const reason = (p: Candidate) => `Name matches “${raw.trim()}”${p.status === "claimed" ? " · Venn member" : ""}.`;
    const ranked = named.map((p, i) => ({ profileId: p.id, score: 1 - i * 0.01, reason: reason(p) }));
    const goalId = await saveGoal(profileId, raw, parsed, [], ranked, opts.standing ?? false);
    emit({ type: "step", id: "search", label, status: "done" });
    emit({ type: "step", id: "ready", label: "Ready", status: "done" });
    emit({
      type: "result", goalId, explanation: parsed.explanation, understood: [`Name: ${raw.trim()}`], relaxed: [],
      matches: named.map((profile, i) => ({ profile, score: ranked[i].score, reason: ranked[i].reason, rank: i + 1 })),
      usedFallback: false,
    });
    return goalId;
  }

  emit({ type: "step", id: "parse", label: "Understanding your goal", status: "running" });
  const totalP = countSearchable(); // runs while Claude reads the goal
  totalP.catch(() => {});
  const parsed = await parseGoal(raw, { roles: me.roles, major: me.major, classYear: me.classYear, employer: me.employer, jobTitle: me.jobTitle, city: me.city });
  emit({ type: "step", id: "parse", label: "Understanding your goal", status: "done" });

  if (parsed.intent === "other" && parsed.clarifying_question) {
    emit({ type: "clarify", question: parsed.clarifying_question, explanation: parsed.explanation });
    return null;
  }

  const total = await totalP;
  const searchLabel = `Searching ${fmt(total)} Yellow Jackets`;
  emit({ type: "step", id: "search", label: searchLabel, status: "running" });
  const { candidates, relaxed } = await searchProfiles(parsed, profileId);
  emit({ type: "step", id: "search", label: searchLabel, status: "done" });

  const rankLabel = `Ranking ${fmt(Math.min(candidates.length, 40))} matches`;
  emit({ type: "step", id: "rank", label: rankLabel, status: "running" });
  const ranked = await rankMatches(parsed, candidates, 12);
  emit({ type: "step", id: "rank", label: rankLabel, status: "done" });

  const goalId = await saveGoal(profileId, raw, parsed, relaxed, ranked.matches, opts.standing ?? false);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const matches: MatchView[] = ranked.matches.map((m, i) => {
    const { vscore: _v, ...profile } = byId.get(m.profileId)!;
    return { profile, score: m.score, reason: m.reason, rank: i + 1 };
  });

  emit({ type: "step", id: "ready", label: "Ready", status: "done" });
  emit({
    type: "result", goalId, explanation: parsed.explanation, understood: understoodChips(parsed), relaxed, matches,
    usedFallback: parsed.source === "rules" || ranked.source === "rules",
  });
  return goalId;
}

async function saveGoal(owner: string, raw: string, parsed: ParsedGoal, relaxed: string[], matches: { profileId: string; score: number; reason: string }[], standing: boolean) {
  return sql.begin(async (tx) => {
    const [g] = await tx`
      insert into goals (owner_profile_id, raw_text, parsed, standing, relaxed)
      values (${owner}, ${raw}, ${tx.json(parsed as never)}, ${standing}, ${relaxed}) returning id`;
    if (matches.length) {
      // One multi-row insert instead of one round trip per match.
      const rows = matches.map((m, i) => ({ goal_id: g.id, profile_id: m.profileId, score: m.score, reason: m.reason, rank: i + 1 }));
      await tx`insert into goal_matches ${tx(rows, "goal_id", "profile_id", "score", "reason", "rank")}`;
    }
    return g.id as string;
  });
}

/** Stored matches for a goal, re-checked for visibility (removed people drop out). */
export async function goalMatches(goalId: string, owner: string) {
  const [g] = await sql`select id, raw_text, parsed, standing, relaxed, created_at from goals where id = ${goalId} and owner_profile_id = ${owner}`;
  if (!g) return null;
  const rows = await sql`select profile_id, score, reason, rank, is_new from goal_matches where goal_id = ${goalId} order by is_new desc, rank`;
  const matches: MatchView[] = [];
  for (const r of rows) {
    const p = await getPublicProfile(r.profile_id);
    if (p) matches.push({ profile: p, score: Number(r.score), reason: r.reason, rank: r.rank, isNew: r.is_new });
  }
  return { goal: { id: g.id as string, rawText: g.raw_text as string, explanation: (g.parsed as ParsedGoal).explanation, understood: understoodChips(g.parsed as ParsedGoal), standing: g.standing as boolean, relaxed: g.relaxed as string[], createdAt: g.created_at as Date }, matches };
}

/** suggest_next_best: the best match from the same goal the sender hasn't contacted yet. */
export async function suggestNextBest(goalId: string, owner: string): Promise<MatchView | null> {
  const rows = await sql`
    select gm.profile_id, gm.score, gm.reason, gm.rank from goal_matches gm
    where gm.goal_id = ${goalId}
      and not exists (select 1 from intro_requests i where i.sender_profile_id = ${owner} and i.recipient_profile_id = gm.profile_id)
    order by gm.rank`;
  for (const r of rows) {
    const p = await getPublicProfile(r.profile_id);
    if (p && p.acceptingIntros) return { profile: p, score: Number(r.score), reason: r.reason, rank: r.rank };
  }
  return null;
}

/** Standing goals (§7.5): re-run search + rank, insert NEW matches and flag them. */
export async function rerunStandingGoals(opts: { goalId?: string } = {}) {
  const goals = await sql`select id, owner_profile_id, raw_text, parsed from goals where standing ${opts.goalId ? sql`and id = ${opts.goalId}` : sql``}`;
  let added = 0;
  for (const g of goals) {
    const parsed = g.parsed as ParsedGoal;
    const existing = await sql`select profile_id from goal_matches where goal_id = ${g.id}`;
    const known = existing.map((e) => e.profile_id as string);
    const contacted = await sql`select recipient_profile_id from intro_requests where sender_profile_id = ${g.owner_profile_id}`;
    const { candidates } = await searchProfiles(parsed, g.owner_profile_id, { exclude: [...known, ...contacted.map((c) => c.recipient_profile_id as string)], limit: 60 });
    if (!candidates.length) continue;
    // Only accept new people who score as well as the weakest stored match (keeps quality up).
    const floor = known.length ? Math.min(...(await sql`select score from goal_matches where goal_id = ${g.id}`).map((r) => Number(r.score))) : 0;
    const ranked = await rankMatches(parsed, candidates, 5);
    const maxRank = existing.length;
    let i = 0;
    for (const m of ranked.matches) {
      if (m.score < floor * 0.9) continue;
      await sql`insert into goal_matches (goal_id, profile_id, score, reason, rank, is_new) values (${g.id}, ${m.profileId}, ${m.score}, ${m.reason}, ${maxRank + ++i}, true) on conflict do nothing`;
      added++;
    }
    await sql`update goals set last_run_at = now() where id = ${g.id}`;
  }
  return { goals: goals.length, added };
}
