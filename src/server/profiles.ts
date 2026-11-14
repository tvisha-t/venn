import { sql } from "./db";
import { PUBLIC_COLUMNS, VISIBLE_PREDICATE, toPublicProfile, type PublicProfile } from "./dto";
import { embedOne, profileEmbedText, toPgVector } from "./embed";
import { HttpError } from "./http";

const ACCEPTING = `not exists (select 1 from contact_points cp where cp.profile_id = p.id and (cp.do_not_contact or cp.bounced))`;

/** A profile visible to other users (or null). */
export async function getPublicProfile(id: string): Promise<PublicProfile | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await sql.unsafe(
    `select ${PUBLIC_COLUMNS}, ${ACCEPTING} as accepting_intros from profiles p where p.id = $1 and ${VISIBLE_PREDICATE}`,
    [id],
  );
  return rows[0] ? toPublicProfile(rows[0]) : null;
}

/** Batch version of getPublicProfile: one query; hidden/removed people are simply absent. */
export async function getPublicProfiles(ids: string[]): Promise<Map<string, PublicProfile>> {
  const valid = [...new Set(ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (!valid.length) return new Map();
  const rows = await sql.unsafe(
    `select ${PUBLIC_COLUMNS}, ${ACCEPTING} as accepting_intros from profiles p where p.id = any($1::uuid[]) and ${VISIBLE_PREDICATE}`,
    [valid],
  );
  return new Map(rows.map((r) => { const p = toPublicProfile(r); return [p.id, p] as const; }));
}

/** The signed-in user's own profile, including unapproved state. Still no contact data. */
export async function getOwnProfile(profileId: string) {
  const [r] = await sql.unsafe(
    `select ${PUBLIC_COLUMNS}, p.ferpa_restricted, p.updated_at, p.created_at from profiles p where p.id = $1 and p.status = 'claimed'`,
    [profileId],
  );
  if (!r) throw new HttpError(404, "Profile not found");
  const pub = toPublicProfile({ ...r, summary_approved: true });
  return { ...pub, summaryApproved: r.summary_approved as boolean, updatedAt: r.updated_at as Date, createdAt: r.created_at as Date };
}

export type ProfileEdit = Partial<{
  firstName: string; lastName: string; roles: string[]; classYear: number | null; degree: string | null; major: string | null;
  gtPrograms: string[]; csThreads: string[]; activities: string[]; industry: string | null; employer: string | null;
  jobTitle: string | null; city: string | null; state: string | null; country: string | null; summary: string | null;
  openTo: string[]; interests: string[];
}>;

const MAP: Record<keyof ProfileEdit, string> = {
  firstName: "first_name", lastName: "last_name", roles: "roles", classYear: "class_year", degree: "degree", major: "major",
  gtPrograms: "gt_programs", csThreads: "cs_threads", activities: "activities", industry: "industry", employer: "employer",
  jobTitle: "job_title", city: "city", state: "state", country: "country", summary: "summary", openTo: "open_to", interests: "interests",
};

/**
 * Self-repair for a published member: if their search entry (embedding) or map location is missing
 * (e.g. an unlisted city, or a failed embed), rebuild it. Never needs the member to re-save.
 */
export async function repairSearchable(profileId: string): Promise<boolean> {
  const [r] = await sql`select * from profiles where id = ${profileId} and status = 'claimed' and summary_approved
    and (embedding is null or (lat is null and (city is not null or state is not null)))`;
  if (!r) return false;
  if (r.lat == null) {
    const { geocode } = await import("./geo");
    const { lat, lng } = geocode(r.city, r.state, profileId);
    if (lat != null) await sql`update profiles set lat = ${lat}, lng = ${lng} where id = ${profileId}`;
  }
  if (r.embedding == null) {
    const v = await embedOne(profileEmbedText(r), "document");
    await sql`update profiles set embedding = ${toPgVector(v)}::vector where id = ${profileId}`;
  }
  return true;
}

export async function updateOwnProfile(profileId: string, edit: ProfileEdit, opts: { approve?: boolean } = {}) {
  const sets: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(edit)) if (v !== undefined && k in MAP) sets[MAP[k as keyof ProfileEdit]] = v;
  if (Object.keys(sets).length) {
    await sql`update profiles set ${sql(sets as Record<string, never>)}, updated_at = now() where id = ${profileId} and status = 'claimed'`;
  }
  if (opts.approve) await sql`update profiles set summary_approved = true, updated_at = now() where id = ${profileId}`;
  // Re-embed after any change
  const [r] = await sql`select * from profiles where id = ${profileId}`;
  if (r) {
    if (sets.city !== undefined || sets.state !== undefined || (r.city && r.lat == null)) {
      const { geocode } = await import("./geo");
      const { lat, lng } = geocode(r.city, r.state, profileId);
      await sql`update profiles set lat = ${lat}, lng = ${lng} where id = ${profileId}`;
    }
    const v = await embedOne(profileEmbedText(r), "document");
    await sql`update profiles set embedding = ${toPgVector(v)}::vector where id = ${profileId}`;
  }
  return getOwnProfile(profileId);
}
