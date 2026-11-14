// Canonical values present in the directory, so parsed goals map onto real filter values.
import { sql } from "../db";
import { VISIBLE_PREDICATE } from "../dto";

export type Vocab = { employers: string[]; industries: string[]; cities: string[]; programs: string[]; majors: string[] };
let cache: { at: number; v: Vocab } | null = null;

export async function getVocab(): Promise<Vocab> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.v;
  const vis = sql.unsafe(VISIBLE_PREDICATE);
  const [emp, ind, city, prog, maj] = await Promise.all([
    sql`select p.employer v from profiles p where ${vis} and p.employer is not null group by 1 order by count(*) desc limit 250`,
    sql`select distinct p.industry v from profiles p where ${vis} and p.industry is not null`,
    sql`select distinct p.city v from profiles p where ${vis} and p.city is not null`,
    sql`select distinct unnest(p.gt_programs) v from profiles p where ${vis}`,
    sql`select distinct p.major v from profiles p where ${vis} and p.major is not null`,
  ]);
  const v = {
    employers: emp.map((r) => r.v as string),
    industries: ind.map((r) => r.v as string).sort(),
    cities: city.map((r) => r.v as string).sort(),
    programs: prog.map((r) => r.v as string).sort(),
    majors: maj.map((r) => r.v as string).sort(),
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
