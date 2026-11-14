// Canonical values present in the directory, so parsed goals map onto real filter values.
import { sql } from "../db";
import { VISIBLE_PREDICATE } from "../dto";

export type Vocab = { employers: string[]; industries: string[]; cities: string[]; programs: string[]; majors: string[] };
let cache: { at: number; v: Vocab } | null = null;

export async function getVocab(): Promise<Vocab> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.v;
  // One statement (one round trip) instead of five parallel queries through the pooler.
  const vis = VISIBLE_PREDICATE;
  const [r] = await sql.unsafe(`select
    (select coalesce(array_agg(v), '{}') from (select p.employer v from profiles p where ${vis} and p.employer is not null group by 1 order by count(*) desc limit 250) e) employers,
    (select coalesce(array_agg(distinct p.industry), '{}') from profiles p where ${vis} and p.industry is not null) industries,
    (select coalesce(array_agg(distinct p.city), '{}') from profiles p where ${vis} and p.city is not null) cities,
    (select coalesce(array_agg(distinct g), '{}') from profiles p, unnest(p.gt_programs) g where ${vis}) programs,
    (select coalesce(array_agg(distinct p.major), '{}') from profiles p where ${vis} and p.major is not null) majors`);
  const v = {
    employers: r.employers as string[],
    industries: [...(r.industries as string[])].sort(),
    cities: [...(r.cities as string[])].sort(),
    programs: [...(r.programs as string[])].sort(),
    majors: [...(r.majors as string[])].sort(),
  };
  cache = { at: Date.now(), v };
  return v;
}

export function clearVocabCache() {
  cache = null;
}

export const OPEN_TO = ["mentoring students", "giving career advice", "hiring", "being hired", "investing",
  "meeting people new to my city", "speaking to student orgs", "cofounding"];
export const ROLES = ["student", "alum", "faculty", "staff", "lifetime_learner"] as const;
