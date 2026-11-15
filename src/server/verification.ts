// Ways to get a verified account: GT email code, official e-transcript, or diploma photo.
// Without a GT email, a member uploads a document with their personal email; a person reviews it
// (manual for the demo), and after approval they sign in with that personal email. The file is kept
// only until the decision (then deleted automatically), never shown to other members; only the method
// appears as a badge.
import { createHash } from "node:crypto";
import { sql } from "./db";
import { audit } from "./audit";
import { HttpError } from "./http";
import { sha256 } from "./crypto";
import { normalizeEmail } from "@/lib/schoolDomain";

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

/** Validates type/size, hashes the file, and blocks reuse of the same document. */
async function hashDocument(method: DocMethod, file: File, buf: Buffer): Promise<string> {
  const rule = UPLOAD_RULES[method];
  const type = file.type || (/\.heic$/i.test(file.name) ? "image/heic" : "");
  if (!(rule.types as readonly string[]).includes(type) || file.size === 0 || file.size > rule.max) {
    throw new HttpError(400, `Upload ${rule.label}.`, "bad_file");
  }
  const hash = createHash("sha256").update(buf).digest("hex");
  const [dup] = await sql`select 1 from verifications where evidence_sha256 = ${hash}`;
  if (dup) throw new HttpError(409, "This file was already used to verify an account.", "reused");
  return hash;
}

// ---------------------------------------------------------------- verify without a GT email
/**
 * Sign-in page "No GT email? Verify with Transcript / Diploma": a PENDING request with the personal
 * email; the file is kept only for the reviewer. Review is manual for the demo
 * (npm run verify:approve -- <email>, or set status = 'approved' in Supabase).
 */
export async function requestDocVerification(method: DocMethod, file: File, rawEmail: string, ip: string) {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new HttpError(400, "Enter the personal email you'll sign in with.", "bad_email");
  const ipHash = sha256(`ip:${ip}`);
  const [{ n }] = await sql`select count(*)::int n from audit_log where action = 'verify.started' and meta->>'ip' = ${ipHash} and at > now() - interval '1 hour'`;
  if (n >= 10) throw new HttpError(429, "Too many attempts. Try again in an hour.", "rate_limited");
  const [already] = await sql`select 1 from verifications where lower(personal_email) = ${email} and status = 'approved'`;
  if (already) throw new HttpError(409, "This email is already verified. Sign in with it on the sign-in page.", "already_verified");
  const buf = Buffer.from(await file.arrayBuffer());
  const hash = await hashDocument(method, file, buf);
  // DEMO: approved automatically (no real document check). The file is never stored: only its hash, to block reuse.
  const [v] = await sql`insert into verifications (method, status, evidence, evidence_sha256, personal_email, decided_at)
    values (${method}, 'approved', ${sql.json({ size_kb: Math.round(file.size / 1024), demo_auto_approved: true })}, ${hash}, ${email}, now()) returning id`;
  await audit("anon", "verify.started", v.id, { method, ip: ipHash });
  await audit("system:auto-approve", "verify.approved", v.id, { method, demo: true });
  // "You're verified" email, right away. A failed send doesn't undo the approval.
  try {
    const { verifiedEmail } = await import("./email/templates");
    const { deliver } = await import("./email/provider");
    const { env } = await import("./env");
    const { maskEmail } = await import("@/lib/schoolDomain");
    const mail = verifiedEmail({ method, signInUrl: `${env.appUrl}/signin?email=${encodeURIComponent(email)}` });
    await deliver({
      introId: null, mailbox: "signin", toProfileId: null, toLabel: maskEmail(email), toAddress: email,
      fromName: "Venn", replyTo: "", replyToLabel: "No reply", subject: mail.subject, html: mail.html, text: mail.text, kind: "notification",
    });
  } catch (e) {
    console.warn("[verify] approval email failed:", (e as Error).message);
  }
  return { status: "approved" as const, email };
}

/** True if this personal email has an approved request (so it may get a sign-in code). */
export async function hasApprovedRequest(email: string): Promise<boolean> {
  const [r] = await sql`select 1 from verifications where lower(personal_email) = ${email} and status = 'approved' limit 1`;
  return Boolean(r);
}

/**
 * First sign-in after approval: create the account (alum, verified by the document) for that personal
 * email. Does nothing if the email already has an account or has no approved request.
 */
export async function ensureAccountFromApproved(email: string) {
  await sql.begin(async (tx) => {
    const [u] = await tx`select 1 from users where lower(login_email) = ${email}`;
    if (u) return;
    const [v] = await tx`select id, method from verifications where lower(personal_email) = ${email} and status = 'approved' and profile_id is null
      order by decided_at desc nulls last limit 1 for update`;
    if (!v) return;
    const [school] = await tx`select id from schools where slug = 'gatech'`;
    const [nu] = await tx`insert into users (auth_subject, login_email, verified_via)
      values (${`personal|${sha256(email).slice(0, 24)}`}, ${email}, ${v.method}) returning id`;
    // A transcript or diploma shows they graduated: start as alum (they can change it in the builder).
    const [p] = await tx`insert into profiles (school_id, user_id, status, source, first_name, last_name, roles, summary_approved, verified_method, verified_at)
      values (${school.id}, ${nu.id}, 'claimed', 'self', '-', '-', ${["alum"]}, false, ${v.method}, now()) returning id`;
    await tx`insert into contact_points (profile_id, email_primary) values (${p.id}, ${email}) on conflict do nothing`;
    await tx`update verifications set profile_id = ${p.id} where id = ${v.id}`;
    await audit(`user:${nu.id}`, "verify.approved", p.id, { method: v.method }, tx);
  });
}

/** Signed-in members can add a document as extra proof (recorded "in review"; demo: not checked). */
export async function submitUpload(profileId: string, method: DocMethod, file: File) {
  const [{ n }] = await sql`select count(*)::int n from verifications where profile_id = ${profileId} and created_at > now() - interval '1 hour'`;
  if (n >= 5) throw new HttpError(429, "Too many verification attempts. Try again in an hour.", "rate_limited");
  const buf = Buffer.from(await file.arrayBuffer());
  const hash = await hashDocument(method, file, buf);
  await sql`insert into verifications (profile_id, method, status, evidence, evidence_sha256)
    values (${profileId}, ${method}, 'pending', ${sql.json({ size_kb: Math.round(file.size / 1024) })}, ${hash})`;
  await audit(`profile:${profileId}`, "verify.started", profileId, { method });
  return { status: "pending" as const };
}
