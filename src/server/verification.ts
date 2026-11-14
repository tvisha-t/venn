// Ways to get a verified account: GT email code, official e-transcript, or diploma photo.
// Without a GT email, a member uploads a document, then adds a PERSONAL email (code-verified), which
// becomes their sign-in. DEMO: uploads are not actually checked; any file counts. The file is hashed
// (to block reuse) and discarded in memory: never stored, logged, or shown to anyone.
import { createHash } from "node:crypto";
import { sql } from "./db";
import { audit } from "./audit";
import { HttpError } from "./http";
import { signPayload, verifyPayload, sha256 } from "./crypto";

export type Method = "gt_email" | "etranscript" | "diploma_photo";
export type DocMethod = "etranscript" | "diploma_photo";
export const METHOD_BADGE: Record<Method, string> = {
  gt_email: "Verified · GT email", etranscript: "Verified · transcript", diploma_photo: "Verified · diploma",
};

/** Approved methods for a profile (first = how they got in). Shown as badges; never the evidence. */
export async function verificationBadges(profileId: string): Promise<{ method: Method; label: string }[]> {
  const rows = await sql`
    select verified_method m, 0 o from profiles where id = ${profileId} and verified_at is not null and verified_method is not null
    union select method m, 1 o from verifications where profile_id = ${profileId} and status = 'approved' and method <> 'quiz'
    order by o`;
  const seen = new Set<string>();
  return rows.filter((r) => METHOD_BADGE[r.m as Method] && !seen.has(r.m) && seen.add(r.m)).map((r) => ({ method: r.m as Method, label: METHOD_BADGE[r.m as Method] }));
}

export async function verifyStatus(profileId: string) {
  const [badges, pending] = await Promise.all([
    verificationBadges(profileId),
    sql`select method, created_at from verifications where profile_id = ${profileId} and status = 'pending' and method <> 'quiz' order by created_at desc`,
  ]);
  return { badges, pending: pending.map((p) => ({ method: p.method as Method, at: new Date(p.created_at).toISOString() })) };
}

const UPLOAD_RULES = {
  etranscript: { max: 5 * 1024 * 1024, types: ["application/pdf"], label: "a PDF up to 5 MB" },
  diploma_photo: { max: 10 * 1024 * 1024, types: ["image/jpeg", "image/png", "image/heic", "image/heif"], label: "a JPG, PNG or HEIC photo up to 10 MB" },
} as const;

/** Validates type/size, hashes the file in memory (then it's dropped), and blocks reuse. */
async function hashDocument(method: DocMethod, file: File): Promise<string> {
  const rule = UPLOAD_RULES[method];
  const type = file.type || (/\.heic$/i.test(file.name) ? "image/heic" : "");
  if (!(rule.types as readonly string[]).includes(type) || file.size === 0 || file.size > rule.max) {
    throw new HttpError(400, `Upload ${rule.label}.`, "bad_file");
  }
  const hash = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
  const [dup] = await sql`select 1 from verifications where evidence_sha256 = ${hash}`;
  if (dup) throw new HttpError(409, "This file was already used to verify an account.", "reused");
  return hash;
}

// ---------------------------------------------------------------- sign-up without a GT email
export const TICKET_COOKIE = "venn_vticket";
export const TICKET_MAX_MS = 30 * 60_000;
type Ticket = { method: DocMethod; hash: string };

/** Step 1: document uploaded → a signed, short-lived ticket (cookie). Nothing else is stored yet. */
export async function startDocSignup(method: DocMethod, file: File, ip: string): Promise<string> {
  const [{ n }] = await sql`select count(*)::int n from audit_log where action = 'verify.started' and meta->>'ip' = ${sha256(`ip:${ip}`)} and at > now() - interval '1 hour'`;
  if (n >= 10) throw new HttpError(429, "Too many attempts. Try again in an hour.", "rate_limited");
  const hash = await hashDocument(method, file);
  await audit("anon", "verify.started", null, { method, ip: sha256(`ip:${ip}`) });
  return signPayload("verify-ticket", { method, hash });
}

export function readTicket(cookie: string | undefined) {
  return verifyPayload<Ticket>("verify-ticket", cookie, TICKET_MAX_MS);
}

/**
 * Step 3 (after the personal email's code is verified): create the account, verified by the document.
 * If the email already has an account, it just signs in (and records the document as extra proof).
 */
export async function createDocAccount(email: string, t: Ticket): Promise<{ userId: string; profileId: string; isNew: boolean }> {
  return sql.begin(async (tx) => {
    const [existing] = await tx`select u.id uid, p.id pid from users u join profiles p on p.user_id = u.id and p.status = 'claimed'
      where lower(u.login_email) = ${email} limit 1`;
    let userId: string, profileId: string, isNew = false;
    if (existing) {
      userId = existing.uid; profileId = existing.pid;
    } else {
      const [school] = await tx`select id from schools where slug = 'gatech'`;
      const [u] = await tx`insert into users (auth_subject, login_email, verified_via)
        values (${`personal|${sha256(email).slice(0, 24)}`}, ${email}, ${t.method}) returning id`;
      // A transcript or diploma shows they graduated: start as alum (they can change it in the builder).
      const [p] = await tx`insert into profiles (school_id, user_id, status, source, first_name, last_name, roles, summary_approved, verified_method, verified_at)
        values (${school.id}, ${u.id}, 'claimed', 'self', '-', '-', ${["alum"]}, false, ${t.method}, now()) returning id`;
      await tx`insert into contact_points (profile_id, email_primary) values (${p.id}, ${email}) on conflict do nothing`;
      userId = u.id; profileId = p.id; isNew = true;
    }
    await tx`insert into verifications (profile_id, method, status, evidence, evidence_sha256, decided_at)
      values (${profileId}, ${t.method}, 'approved', ${tx.json({ demo_auto_approved: true })}, ${t.hash}, now())
      on conflict do nothing`;
    await audit(`user:${userId}`, "verify.approved", profileId, { method: t.method, demo: true }, tx);
    return { userId, profileId, isNew };
  });
}

/** Signed-in members can add a document as extra proof (recorded "in review"; demo: not checked). */
export async function submitUpload(profileId: string, method: DocMethod, file: File) {
  const [{ n }] = await sql`select count(*)::int n from verifications where profile_id = ${profileId} and created_at > now() - interval '1 hour'`;
  if (n >= 5) throw new HttpError(429, "Too many verification attempts. Try again in an hour.", "rate_limited");
  const hash = await hashDocument(method, file);
  await sql`insert into verifications (profile_id, method, status, evidence, evidence_sha256)
    values (${profileId}, ${method}, 'pending', ${sql.json({ size_kb: Math.round(file.size / 1024) })}, ${hash})`;
  await audit(`profile:${profileId}`, "verify.started", profileId, { method });
  return { status: "pending" as const };
}
