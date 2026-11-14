import { sql } from "../db";
import { PUBLIC_COLUMNS, VISIBLE_PREDICATE, toPublicProfile, type PublicProfile } from "../dto";
import { embedOne, toPgVector } from "../embed";
import type { ParsedGoal } from "./parse";

export type Candidate = PublicProfile & { vscore: number };

type F = ParsedGoal["filters"];

/** Relaxation order (§7.4): city → class years → programs, then broader steps so the flow never dead-ends. */
const RELAX_STEPS: { key: string; label: string; apply: (f: F) => F; applies: (f: F) => boolean }[] = [
  { key: "city", label: "city", applies: (f) => f.cities.length > 0, apply: (f) => ({ ...f, cities: [] }) },
  { key: "class_years", label: "class years", applies: (f) => f.class_year_min != null || f.class_year_max != null, apply: (f) => ({ ...f, class_year_min: null, class_year_max: null }) },
  { key: "programs", label: "GT programs", applies: (f) => f.gt_programs.length > 0, apply: (f) => ({ ...f, gt_programs: [] }) },
  { key: "majors", label: "majors", applies: (f) => f.majors.length > 0, apply: (f) => ({ ...f, majors: [] }) },
  { key: "employers", label: "employer (showing the same industry)", applies: (f) => f.employers.length > 0, apply: (f) => ({ ...f, employers: [] }) },
  { key: "industries", label: "industry", applies: (f) => f.industries.length > 0, apply: (f) => ({ ...f, industries: [] }) },
];

async function query(f: F, vec: string, viewer: string, limit: number, extraExclude: string[]) {
  // open_to is a ranking boost, not a hard filter: unclaimed alumni have no open_to data.
  return sql`
    select ${sql.unsafe(PUBLIC_COLUMNS)},
      not exists (select 1 from contact_points cp where cp.profile_id = p.id and (cp.do_not_contact or cp.bounced)) as accepting_intros,
      (1 - (p.embedding <=> ${vec}::vector))
        + case when p.open_to && ${f.open_to}::text[] then 0.15 else 0 end
        + case when p.status = 'claimed' then 0.05 else 0 end as vscore
    from profiles p
    where ${sql.unsafe(VISIBLE_PREDICATE)} and p.id <> ${viewer} and p.embedding is not null
      ${extraExclude.length ? sql`and p.id <> all(${extraExclude})` : sql``}
      ${f.employers.length ? sql`and lower(p.employer) = any(${f.employers.map((e) => e.toLowerCase())})` : sql``}
      ${f.industries.length ? sql`and p.industry = any(${f.industries})` : sql``}
      ${f.cities.length ? sql`and lower(p.city) = any(${f.cities.map((c) => c.toLowerCase())})` : sql``}
      ${f.roles.length ? sql`and p.roles && ${f.roles}::text[]` : sql``}
      ${f.class_year_min != null ? sql`and p.class_year >= ${f.class_year_min}` : sql``}
      ${f.class_year_max != null ? sql`and p.class_year <= ${f.class_year_max}` : sql``}
      ${f.majors.length ? sql`and p.major = any(${f.majors})` : sql``}
      ${f.gt_programs.length ? sql`and p.gt_programs && ${f.gt_programs}::text[]` : sql``}
    order by vscore desc
    limit ${limit}`;
}

/** search_profiles tool: SQL filters + pgvector similarity, ≤ 200 candidates, no contact data. */
export async function searchProfiles(goal: ParsedGoal, viewer: string, opts: { limit?: number; exclude?: string[] } = {}) {
  const vec = toPgVector(await embedOne(`${goal.semantic_query} ${goal.filters.open_to.join(" ")}`, "query"));
  let f = goal.filters;
  const relaxed: string[] = [];
  let rows = await query(f, vec, viewer, opts.limit ?? 200, opts.exclude ?? []);
  for (const step of RELAX_STEPS) {
    if (rows.length > 0) break;
    if (!step.applies(f)) continue;
    f = step.apply(f);
    relaxed.push(step.label);
    rows = await query(f, vec, viewer, opts.limit ?? 200, opts.exclude ?? []);
  }
  const candidates: Candidate[] = rows.map((r) => ({ ...toPublicProfile(r), vscore: Number(r.vscore) }));
  return { candidates, relaxed, effectiveFilters: f };
}

export async function countSearchable() {
  const [{ n }] = await sql`select count(*)::int n from profiles p where ${sql.unsafe(VISIBLE_PREDICATE)}`;
  return n as number;
}
