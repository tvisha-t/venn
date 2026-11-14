// Personal invite links ("Text an invite"). The member sends the link from their own phone, so
// Venn never sees their contacts and never stores a phone number. We only record that someone
// joined through a link, so the member can see "3 people joined with your link".
import { randomInt } from "node:crypto";
import { sql } from "./db";
import { audit } from "./audit";
import { env } from "./env";
import { getOwnProfile } from "./profiles";
import { HttpError } from "./http";

export const REF_COOKIE = "venn_ref";
export const REF_COOKIE_DAYS = 30;
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/l/i: easy to read aloud or retype
export const CODE_RE = /^[a-z2-9]{6,12}$/;

function newCode(len = 8): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

export const joinUrl = (code: string) => `${env.appUrl.replace(/\/$/, "")}/join/${code}`;

export type InviteLink = { code: string; url: string; joined: number };

async function joinedCount(profileId: string): Promise<number> {
  const [r] = await sql`select count(*)::int n from referrals where inviter_profile_id = ${profileId}`;
  return r.n as number;
}

/** The member's personal link, created on first use. Only approved profiles can invite. */
export async function getOrCreateInviteLink(profileId: string, userId: string): Promise<InviteLink> {
  const me = await getOwnProfile(profileId);
  if (!me.summaryApproved) throw new HttpError(403, "Approve your profile before inviting people.");
  const [existing] = await sql`select code from invite_links where inviter_profile_id = ${profileId}`;
  if (existing) return { code: existing.code, url: joinUrl(existing.code), joined: await joinedCount(profileId) };
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    const [row] = await sql`insert into invite_links (code, inviter_profile_id) values (${code}, ${profileId})
      on conflict do nothing returning code`;
    if (row) {
      await audit(`user:${userId}`, "invite.link_created", profileId);
      return { code, url: joinUrl(code), joined: await joinedCount(profileId) };
    }
    const [raced] = await sql`select code from invite_links where inviter_profile_id = ${profileId}`;
    if (raced) return { code: raced.code, url: joinUrl(raced.code), joined: await joinedCount(profileId) };
  }
  throw new HttpError(500, "Couldn't create your invite link. Try again.");
}

/** New code; the old link stops working (e.g. it was posted somewhere public). Join counts are kept. */
export async function resetInviteLink(profileId: string, userId: string): Promise<InviteLink> {
  await getOrCreateInviteLink(profileId, userId);
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    const [row] = await sql`update invite_links set code = ${code}, created_at = now()
      where inviter_profile_id = ${profileId} and not exists (select 1 from invite_links where code = ${code}) returning code`;
    if (row) {
      await audit(`user:${userId}`, "invite.link_reset", profileId);
      return { code, url: joinUrl(code), joined: await joinedCount(profileId) };
    }
  }
  throw new HttpError(500, "Couldn't reset your invite link. Try again.");
}

export type Inviter = { profileId: string; firstName: string; lastInitial: string; context: string };

/**
 * What the public /join page shows: first name, last initial and a short GT line. Nothing else.
 * Null for unknown codes and for members who can't be shown (unapproved, removed, FERPA-restricted).
 */
export async function inviterForCode(code: string): Promise<Inviter | null> {
  const c = code.trim().toLowerCase();
  if (!CODE_RE.test(c)) return null;
  const [p] = await sql`
    select p.id, p.first_name, p.last_name, p.roles, p.major, p.class_year
    from invite_links l join profiles p on p.id = l.inviter_profile_id
    where l.code = ${c} and p.status = 'claimed' and p.summary_approved and not p.ferpa_restricted`;
  if (!p) return null;
  const roles = p.roles as string[];
  const short = String(p.major ?? "").replace("Computer Science", "CS").replace(" Engineering", " Eng.");
  const yr = p.class_year ? ` '${String(p.class_year).slice(2)}` : "";
  const role = roles.includes("faculty") ? "Faculty" : roles.includes("staff") ? "Staff"
    : roles.includes("alum") ? "Alum" : roles.includes("student") ? "Student" : "Yellow Jacket";
  const context = [role, `${short}${yr}`.trim()].filter(Boolean).join(" · ");
  return { profileId: p.id, firstName: p.first_name, lastInitial: String(p.last_name ?? "").slice(0, 1), context };
}

/** Credits the inviter when someone joins (new account or claimed listing) through their link. */
export async function recordReferral(newProfileId: string, code: string | null | undefined): Promise<boolean> {
  if (!code) return false;
  const inviter = await inviterForCode(code);
  if (!inviter || inviter.profileId === newProfileId) return false;
  const [row] = await sql`insert into referrals (profile_id, inviter_profile_id, code)
    values (${newProfileId}, ${inviter.profileId}, ${code.trim().toLowerCase()}) on conflict do nothing returning profile_id`;
  if (row) await audit(`profile:${newProfileId}`, "referral.join", inviter.profileId);
  return Boolean(row);
}

type Jar = { get(name: string): { value: string } | undefined; delete(name: string): unknown };

/** Called by every sign-in route: if this sign-in created (or claimed) a profile, credit the invite. */
export async function applyReferralCookie(jar: Jar, r: { profileId: string; joined: boolean }) {
  const code = jar.get(REF_COOKIE)?.value;
  if (!code) return;
  if (r.joined) await recordReferral(r.profileId, code);
  jar.delete(REF_COOKIE);
}
