import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** sha256 of the lowercased, trimmed email — what the suppression list stores. */
export function emailHash(email: string | null | undefined): string | null {
  if (!email || !email.trim()) return null;
  return sha256(email.trim().toLowerCase());
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hmac(data: string, secret = env.linkSecret): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// ---------------------------------------------------------------- signed links (§8.4)
export type LinkAction = "decline" | "claim" | "remove" | "noinvite" | "connect";
export const LINK_TTL_DAYS = 60;

/** `${relayToken}.${expEpochSec}.${hmac}` — goes in /r/{signed}/{action}. */
export function signLink(relayToken: string, action: LinkAction, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + LINK_TTL_DAYS * 86400;
  return `${relayToken}.${exp}.${hmac(`${relayToken}:${action}:${exp}`)}`;
}

export type LinkCheck =
  | { ok: true; relayToken: string }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyLink(signed: string, action: LinkAction, now = Date.now()): LinkCheck {
  const parts = signed.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [relayToken, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!relayToken || !Number.isFinite(exp)) return { ok: false, reason: "malformed" };
  if (!safeEq(sig, hmac(`${relayToken}:${action}:${exp}`))) return { ok: false, reason: "bad_signature" };
  if (now / 1000 > exp) return { ok: false, reason: "expired" };
  return { ok: true, relayToken };
}

// ---------------------------------------------------------------- session cookie
export type Session = { userId: string; profileId: string; iat: number };
export const SESSION_COOKIE = "venn_session";

export function signSession(s: Omit<Session, "iat">): string {
  const payload = Buffer.from(JSON.stringify({ ...s, iat: Date.now() })).toString("base64url");
  return `${payload}.${hmac(`session:${payload}`)}`;
}

export function verifySession(cookie: string | undefined | null): Session | null {
  if (!cookie) return null;
  const [payload, sig] = cookie.split(".");
  if (!payload || !sig || !safeEq(sig, hmac(`session:${payload}`))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    if (Date.now() - s.iat > 7 * 86400_000) return null;
    return s;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- short-lived signed cookies
/** Signs a small JSON payload for a cookie. `kind` keeps one cookie type from being replayed as another. */
export function signPayload(kind: string, data: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify({ ...data, iat: Date.now() })).toString("base64url");
  return `${payload}.${hmac(`${kind}:${payload}`)}`;
}

export function verifyPayload<T>(kind: string, cookie: string | undefined | null, maxAgeMs: number): T | null {
  if (!cookie) return null;
  const [payload, sig] = cookie.split(".");
  if (!payload || !sig || !safeEq(sig, hmac(`${kind}:${payload}`))) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString()) as T & { iat: number };
    if (typeof d.iat !== "number" || Date.now() - d.iat > maxAgeMs) return null;
    return d;
  } catch {
    return null;
  }
}

/** Inbound webhook signature: HMAC-SHA256 of the raw body, hex, in `x-venn-signature`. */
export function verifyWebhook(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", env.inboundSecret).update(rawBody).digest("hex");
  return safeEq(signature, expected);
}
export function signWebhook(rawBody: string): string {
  return createHmac("sha256", env.inboundSecret).update(rawBody).digest("hex");
}
