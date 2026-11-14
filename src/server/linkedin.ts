// "Continue with LinkedIn" via Sign In with LinkedIn using OpenID Connect.
// LinkedIn gives ordinary apps only: subject id, name, photo, email (+ verified flag). It does NOT
// give job history or education; members still fill those from the LinkedIn PDF / data-export import.
// We keep only sha256(subject) to recognize a returning member, and the name to prefill a new
// profile. No access token, photo or LinkedIn email is stored. A LinkedIn account alone never
// grants access: the member must also verify a Georgia Tech email (the DB trigger enforces it too).
// Off until LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET are set.
import { sql } from "./db";
import { env } from "./env";
import { sha256, signPayload, verifyPayload } from "./crypto";
import { audit } from "./audit";
import { HttpError } from "./http";

export const LI_STATE_COOKIE = "venn_li_state";
export const LI_PENDING_COOKIE = "venn_li";
export const LI_PENDING_MAX_MS = 30 * 60_000;
const AUTHORIZE = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO = "https://api.linkedin.com/v2/userinfo";

export const redirectUri = () => `${env.appUrl.replace(/\/$/, "")}/api/auth/linkedin/callback`;

export function authorizeUrl(state: string): string {
  const q = new URLSearchParams({
    response_type: "code", client_id: env.linkedinClientId, redirect_uri: redirectUri(), state, scope: "openid profile email",
  });
  return `${AUTHORIZE}?${q}`;
}

export type LinkedInUser = { subHash: string; firstName: string; lastName: string; email: string | null; emailVerified: boolean };

const cleanName = (s: unknown) => String(s ?? "").replace(/[^\p{L}\p{M}' .-]/gu, "").trim().slice(0, 60);

/** Exchanges the authorization code and reads the OIDC userinfo. The access token is used once and dropped. */
export async function fetchLinkedInUser(code: string, fetchImpl: typeof fetch = fetch): Promise<LinkedInUser> {
  const tok = await fetchImpl(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: redirectUri(),
      client_id: env.linkedinClientId, client_secret: env.linkedinClientSecret,
    }),
  });
  if (!tok.ok) throw new HttpError(502, "LinkedIn sign-in didn't finish. Try again, or use your school email.");
  const { access_token } = (await tok.json()) as { access_token?: string };
  if (!access_token) throw new HttpError(502, "LinkedIn sign-in didn't finish. Try again, or use your school email.");
  const info = await fetchImpl(USERINFO, { headers: { authorization: `Bearer ${access_token}` } });
  if (!info.ok) throw new HttpError(502, "Couldn't read your LinkedIn profile. Try again, or use your school email.");
  const u = (await info.json()) as { sub?: string; given_name?: string; family_name?: string; email?: string; email_verified?: boolean | string };
  if (!u.sub) throw new HttpError(502, "Couldn't read your LinkedIn profile. Try again, or use your school email.");
  return {
    subHash: sha256(`linkedin:${u.sub}`),
    firstName: cleanName(u.given_name),
    lastName: cleanName(u.family_name),
    email: u.email ? u.email.trim().toLowerCase() : null,
    emailVerified: u.email_verified === true || u.email_verified === "true",
  };
}

/** The member a LinkedIn account was linked to before, if any. */
export async function userForLinkedIn(subHash: string): Promise<{ userId: string; profileId: string; approved: boolean } | null> {
  const [r] = await sql`select l.user_id, p.id profile_id, p.summary_approved from linkedin_links l
    join profiles p on p.user_id = l.user_id and p.status = 'claimed' where l.sub_hash = ${subHash} limit 1`;
  return r ? { userId: r.user_id, profileId: r.profile_id, approved: r.summary_approved } : null;
}

/** Links LinkedIn to the member and, for a brand-new profile, uses the LinkedIn name. */
export async function linkLinkedIn(userId: string, profileId: string, li: Pick<LinkedInUser, "subHash" | "firstName" | "lastName">, isNew: boolean) {
  await sql`insert into linkedin_links (user_id, sub_hash) values (${userId}, ${li.subHash}) on conflict do nothing`;
  if (isNew && li.firstName) {
    await sql`update profiles set first_name = ${li.firstName}, last_name = ${li.lastName || "-"}, updated_at = now()
      where id = ${profileId} and not summary_approved`;
  }
  await audit(`user:${userId}`, "auth.linkedin", profileId);
}

/** LinkedIn done, school email not yet verified: carried in a signed, short-lived cookie. */
export type PendingLinkedIn = { subHash: string; firstName: string; lastName: string };
export const signPending = (p: PendingLinkedIn) => signPayload("li-pending", p);
export const readPending = (cookie: string | undefined) => verifyPayload<PendingLinkedIn>("li-pending", cookie, LI_PENDING_MAX_MS);

type Jar = { get(name: string): { value: string } | undefined; delete(name: string): unknown };

/** Called after school-email verification: finish a pending LinkedIn connection. */
export async function applyPendingLinkedIn(jar: Jar, r: { userId: string; profileId: string; isNew: boolean }) {
  const p = readPending(jar.get(LI_PENDING_COOKIE)?.value);
  jar.delete(LI_PENDING_COOKIE);
  if (p) await linkLinkedIn(r.userId, r.profileId, p, r.isNew);
}
