import { sql } from "./db";
import { env } from "./env";
import { HttpError } from "./http";
import { requireSession } from "./session";

/** Admin = GT staff role. In sandbox demo mode any signed-in user may open the demo admin. */
export async function requireAdmin() {
  const s = await requireSession();
  const [p] = await sql`select roles from profiles where id = ${s.profileId}`;
  const isStaff = (p?.roles as string[] | undefined)?.includes("staff");
  if (!isStaff && env.emailMode !== "sandbox") throw new HttpError(403, "Admins only.");
  return s;
}

/** Aggregates only — no names, no contact data. */
export async function dashboard() {
  const [profiles] = await sql`select
      count(*) filter (where status = 'claimed' and summary_approved)::int claimed,
      count(*) filter (where status = 'unclaimed')::int unclaimed,
      count(*) filter (where status = 'removed')::int removed
    from profiles where not ferpa_restricted`;
  const [intros] = await sql`select
      count(*) filter (where status <> 'draft')::int total,
      count(*) filter (where status = 'sent')::int sent,
      count(*) filter (where status = 'replied')::int replied,
      count(*) filter (where status = 'not_interested')::int not_interested,
      count(*) filter (where status = 'no_response')::int no_response,
      count(*) filter (where status in ('bounced','suppressed'))::int undeliverable
    from intro_requests`;
  const byIndustry = await sql`select coalesce(p.industry, 'Other') label, count(*)::int sent,
      count(*) filter (where i.status = 'replied')::int replied
    from intro_requests i join profiles p on p.id = i.recipient_profile_id where i.status <> 'draft'
    group by 1 order by 2 desc limit 12`;
  const byCity = await sql`select coalesce(p.city, 'Unknown') label, count(*)::int sent,
      count(*) filter (where i.status = 'replied')::int replied
    from intro_requests i join profiles p on p.id = i.recipient_profile_id where i.status <> 'draft'
    group by 1 order by 2 desc limit 12`;
  const imports = await sql`select at, meta from audit_log where action = 'aa.import' order by id desc limit 5`;
  const audits = await sql`select action, count(*)::int n from audit_log group by 1 order by 2 desc`;
  return {
    profiles, intros,
    replyRate: intros.total ? Math.round((100 * intros.replied) / intros.total) : 0,
    byIndustry, byCity,
    imports: imports.map((i) => ({ at: i.at, counts: i.meta })),
    auditCounts: audits,
  };
}
