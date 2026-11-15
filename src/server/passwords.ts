// Optional passwords: set after a code sign-in, then used instead of codes. Salted scrypt, constant-time
// comparison, and a lockout after repeated wrong passwords (the email code always remains as a way in).
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { sql } from "./db";
import { audit } from "./audit";
import { emailHash } from "./crypto";
import { HttpError } from "./http";
import { normalizeEmail } from "@/lib/schoolDomain";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const MIN_PASSWORD = 8;
export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;

/** "scrypt$<salt b64>$<hash b64>" */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function checkPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, s, h] = stored.split("$");
  if (alg !== "scrypt" || !s || !h) return false;
  const expected = Buffer.from(h, "base64");
  const got = await scrypt(pw, Buffer.from(s, "base64"), expected.length);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export function validatePassword(pw: string) {
  if (pw.length < MIN_PASSWORD) throw new HttpError(400, `Use at least ${MIN_PASSWORD} characters.`, "weak_password");
  if (pw.length > 200) throw new HttpError(400, "That password is too long.", "weak_password");
}

/** Does this email have an account with a password? (Decides the next sign-in step.) */
export async function hasPassword(rawEmail: string): Promise<boolean> {
  const email = normalizeEmail(rawEmail);
  if (!email) return false;
  const [u] = await sql`select 1 from users where lower(login_email) = ${email} and password_hash is not null limit 1`;
  return Boolean(u);
}

export async function userHasPassword(userId: string): Promise<boolean> {
  const [u] = await sql`select password_hash is not null as has from users where id = ${userId}`;
  return Boolean(u?.has);
}

export async function setPassword(userId: string, pw: string) {
  validatePassword(pw);
  await sql`update users set password_hash = ${await hashPassword(pw)}, password_failures = 0, password_locked_until = null where id = ${userId}`;
  await audit(`user:${userId}`, "auth.code_verified", null, { password_set: true });
}

/** Checks email + password. Returns the normalized email on success; throws a friendly error otherwise. */
export async function verifyPasswordSignIn(rawEmail: string, pw: string): Promise<string> {
  const email = normalizeEmail(rawEmail);
  const bad = new HttpError(400, "That email and password don't match.", "bad_password");
  if (!email || !pw) throw bad;
  const [u] = await sql`select id, password_hash, password_failures, password_locked_until > now() as locked
    from users where lower(login_email) = ${email} limit 1`;
  if (!u?.password_hash) throw bad;
  if (u.locked) throw new HttpError(429, `Too many wrong passwords. Use "Email me a code instead", or try again in ${LOCK_MINUTES} minutes.`, "locked");
  if (!(await checkPassword(pw, u.password_hash))) {
    const failures = (u.password_failures as number) + 1;
    await sql`update users set password_failures = ${failures},
      password_locked_until = ${failures >= MAX_FAILURES ? sql`now() + make_interval(mins => ${LOCK_MINUTES})` : null}
      where id = ${u.id}`;
    await audit("anon", "auth.code_failed", null, { email_hash: emailHash(email), password: true });
    if (failures >= MAX_FAILURES) throw new HttpError(429, `Too many wrong passwords. Use "Email me a code instead", or try again in ${LOCK_MINUTES} minutes.`, "locked");
    throw bad;
  }
  await sql`update users set password_failures = 0, password_locked_until = null where id = ${u.id}`;
  await audit("anon", "auth.code_verified", null, { email_hash: emailHash(email), password: true });
  return email;
}
