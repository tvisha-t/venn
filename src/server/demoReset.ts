// "Reset demo": erase EVERYTHING tied to the demo owner's own addresses so a brand-new account can be
// created. Only addresses listed in DEMO_RESET_EMAILS (env, never committed) can ever be erased, and only
// by a member signed in as one of them.
import { sql } from "./db";
import { emailHash } from "./crypto";
import { audit } from "./audit";

export function demoResetEmails(): string[] {
  return (process.env.DEMO_RESET_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/** May this signed-in user see/use "Reset demo"? */
export async function canResetDemo(userId: string): Promise<boolean> {
  const list = demoResetEmails();
  if (!list.length) return false;
  const [u] = await sql`select lower(login_email) e from users where id = ${userId}`;
  return Boolean(u && list.includes(u.e));
}

/** Erases all accounts, profiles and records for the configured demo addresses. One transaction. */
export async function eraseDemoAccounts() {
  const emails = demoResetEmails();
  const hashes = emails.map((e) => emailHash(e)!);
  return sql.begin(async (tx) => {
    const users = await tx`select id from users where lower(login_email) = any(${emails})`;
    const userIds = users.map((u) => u.id as string);
    const profiles = userIds.length ? await tx`select id from profiles where user_id = any(${userIds})` : [];
    const pids = profiles.map((p) => p.id as string);
    const n: Record<string, number> = {};
    const del = async (label: string, q: PromiseLike<readonly unknown[]>) => { n[label] = (await q).length; };
    if (pids.length) {
      await del("intros", tx`delete from intro_requests where sender_profile_id = any(${pids}) or recipient_profile_id = any(${pids}) returning 1`);
      await del("goal_matches", tx`delete from goal_matches where profile_id = any(${pids}) or goal_id in (select id from goals where owner_profile_id = any(${pids})) returning 1`);
      await del("goals", tx`delete from goals where owner_profile_id = any(${pids}) returning 1`);
      // contact, RSVPs, hosted events, groups, invites, referrals, verifications, sandbox mail: cascade with the profile
      await del("profiles", tx`delete from profiles where id = any(${pids}) returning 1`);
    }
    if (userIds.length) await del("users", tx`delete from users where id = any(${userIds}) returning 1`); // LinkedIn link cascades
    await del("verification_requests", tx`delete from verifications where lower(personal_email) = any(${emails}) returning 1`);
    await del("signin_codes", tx`delete from signin_codes where email_hash = any(${hashes}) returning 1`);
    await del("invites", tx`delete from invites where email_hash = any(${hashes}) returning 1`);
    await del("invite_optouts", tx`delete from invite_optouts where email_hash = any(${hashes}) returning 1`);
    await del("suppression", tx`delete from suppression_list where email_hash = any(${hashes}) returning 1`);
    await audit("demo:reset", "verify.revoked", null, { erased: n }, tx);
    return n;
  });
}
