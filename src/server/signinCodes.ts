// School-email verification: a 6-digit code sent to the address proves the person owns it.
// Stores only hashes (email, code, IP). Audit rows carry the email hash, never the address.
import { randomInt } from "node:crypto";
import { sql } from "./db";
import { audit } from "./audit";
import { emailHash, hmac, safeEq, sha256 } from "./crypto";
import { HttpError } from "./http";
import { deliver } from "./email/provider";
import { signinCodeEmail } from "./email/templates";
import { GATECH, maskEmail, normalizeEmail, schoolForEmail } from "@/lib/schoolDomain";

export const CODE_TTL_SEC = 600;
export const RESEND_COOLDOWN_SEC = 60;
export const MAX_CODES_PER_EMAIL_HOUR = 5;
export const MAX_CODES_PER_IP_HOUR = 20;
export const MAX_WRONG_TRIES = 5;

const codeHash = (eh: string, code: string) => hmac(`signin:${eh}:${code}`);

export function wrongDomainMessage() {
  return `Use your ${GATECH.name} email, ending in @${GATECH.domains[0]}.`;
}

/** Validates the address is a school email (throws a friendly 400 otherwise). */
export function requireSchoolEmail(raw: string): string {
  const email = normalizeEmail(raw);
  if (!email || !schoolForEmail(email)) throw new HttpError(400, wrongDomainMessage(), "wrong_domain");
  return email;
}

export async function requestCode(raw: string, ip: string) {
  const email = normalizeEmail(raw);
  const eh = email ? emailHash(email)! : null;
  if (!email || !schoolForEmail(email)) {
    await audit("anon", "auth.wrong_domain", null, eh ? { email_hash: eh } : {});
    throw new HttpError(400, wrongDomainMessage(), "wrong_domain");
  }
  const ipHash = sha256(`ip:${ip}`);
  const [stats] = await sql`
    select
      (select count(*)::int from signin_codes where email_hash = ${eh} and created_at > now() - interval '1 hour') as email_hour,
      (select count(*)::int from signin_codes where ip_hash = ${ipHash} and created_at > now() - interval '1 hour') as ip_hour,
      (select extract(epoch from now() - max(created_at))::int from signin_codes
        where email_hash = ${eh} and used_at is null and expires_at > now()) as since_last`; // cooldown only while a code is outstanding
  if (stats.since_last != null && stats.since_last < RESEND_COOLDOWN_SEC) {
    const wait = RESEND_COOLDOWN_SEC - stats.since_last;
    throw new HttpError(429, `Wait ${wait}s before asking for another code.`, `cooldown:${wait}`);
  }
  if (stats.email_hour >= MAX_CODES_PER_EMAIL_HOUR || stats.ip_hour >= MAX_CODES_PER_IP_HOUR) {
    await audit("anon", "auth.rate_limited", null, { email_hash: eh });
    throw new HttpError(429, "Too many codes requested. Try again in an hour.", "rate_limited");
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await sql`update signin_codes set used_at = now() where email_hash = ${eh} and used_at is null`; // only the newest code works
  await sql`insert into signin_codes (email_hash, code_hash, ip_hash, expires_at)
    values (${eh}, ${codeHash(eh!, code)}, ${ipHash}, now() + make_interval(secs => ${CODE_TTL_SEC}))`;
  const mail = signinCodeEmail(code);
  await deliver({
    introId: null, mailbox: "signin", toProfileId: null, toLabel: maskEmail(email), toAddress: email,
    fromName: "Venn", replyTo: "", replyToLabel: "No reply", subject: mail.subject, html: mail.html, text: mail.text, kind: "signin_code",
  });
  await audit("anon", "auth.code_requested", null, { email_hash: eh });
  // Same answer whether or not an account exists: never reveal who is registered.
  return { ok: true as const, expiresIn: CODE_TTL_SEC, resendIn: RESEND_COOLDOWN_SEC };
}

/** Checks the code. Returns the verified, normalized email or throws a friendly error. */
export async function verifyCode(raw: string, code: string): Promise<string> {
  const email = requireSchoolEmail(raw);
  const eh = emailHash(email)!;
  const clean = code.replace(/\D/g, "");
  const [row] = await sql`select id, code_hash, attempts, expires_at < now() as expired from signin_codes
    where email_hash = ${eh} and used_at is null order by created_at desc limit 1`;
  if (!row || row.expired) throw new HttpError(400, "This code expired. Send a new one.", "code_expired");
  if (row.attempts >= MAX_WRONG_TRIES) throw new HttpError(400, "Too many wrong tries. Send a new code.", "too_many_tries");
  if (clean.length !== 6 || !safeEq(codeHash(eh, clean), row.code_hash)) {
    const [u] = await sql`update signin_codes set attempts = attempts + 1 where id = ${row.id} returning attempts`;
    await audit("anon", "auth.code_failed", null, { email_hash: eh });
    const left = MAX_WRONG_TRIES - u.attempts;
    throw new HttpError(400, left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong tries. Send a new code.", left > 0 ? "wrong_code" : "too_many_tries");
  }
  const [used] = await sql`update signin_codes set used_at = now() where id = ${row.id} and used_at is null returning id`;
  if (!used) throw new HttpError(400, "This code was already used. Send a new one.", "code_expired");
  await audit("anon", "auth.code_verified", null, { email_hash: eh });
  return email;
}
