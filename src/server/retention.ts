// Data retention (§13): message bodies of declined/no-response intros deleted after 180 days;
// their metadata after 1 year. Sandbox emails pruned after 30 days.
import { sql } from "./db";

export async function runRetention(now = new Date()) {
  const d = (days: number) => new Date(now.getTime() - days * 86400_000);
  const bodies = await sql`update intro_requests set message = '[deleted after 180 days]', reply_preview = null
    where status in ('not_interested', 'no_response', 'bounced') and coalesce(sent_at, created_at) < ${d(180)}
    and message <> '[deleted after 180 days]' returning id`;
  const meta = await sql`delete from intro_requests where status in ('not_interested', 'no_response', 'bounced', 'suppressed', 'draft')
    and coalesce(sent_at, created_at) < ${d(365)} returning id`;
  await sql`delete from sandbox_emails where created_at < ${d(30)}`;
  return { bodiesDeleted: bodies.length, introsDeleted: meta.length };
}
