// Email delivery. EMAIL_MODE=sandbox → local mailbox at /dev/inbox (stored by profile id,
// never by address), plus a real copy for addresses on EMAIL_SANDBOX_ALLOWLIST.
// EMAIL_MODE=live → Postmark, with retry + backoff. Fictional demo addresses are never mailed:
// they go to DEMO_INBOX_EMAIL (if set) with the intended person named in the subject.
import { sql } from "../db";
import { env } from "../env";
import { randomToken } from "../crypto";

export type OutboundEmail = {
  introId: string | null;
  mailbox: "recipient" | "sender" | "invitee" | "signin";
  toProfileId: string | null;
  toLabel?: string;           // sandbox display for people without a profile (masked email)
  toName?: string;            // named in the subject when a fictional person's mail is redirected to DEMO_INBOX_EMAIL
  toAddress: string;          // used only for real sends; never stored
  fromName: string;
  replyTo: string;            // relay address, or the consented real address on connected emails
  replyToLabel: string;       // what the sandbox shows instead of the address
  subject: string;
  html: string;
  text: string;
  kind: "intro" | "reminder" | "reply_forward" | "connected" | "notification" | "invite" | "signin_code";
};

export class EmailDeliveryError extends Error {}

/** Reply-To for an intro. With a Postmark inbound stream: <hash>+<relayToken>@inbound.postmarkapp.com (arrives as MailboxHash). */
export function relayAddress(relayToken: string) {
  const inbound = env.postmarkInbound;
  if (inbound.includes("@")) {
    const at = inbound.lastIndexOf("@");
    return `${inbound.slice(0, at)}+${relayToken}@${inbound.slice(at + 1)}`;
  }
  return `reply+${relayToken}@${env.replyDomain}`;
}

export function parseRelayToken(to: string): string | null {
  const m = to.match(/\+([A-Za-z0-9_-]{20,})@/);
  return m ? m[1] : null;
}

/** Reserved, fictional domains used by the seed data. Real mail is never sent to these. */
export function isFictionalAddress(address: string): boolean {
  const d = address.slice(address.lastIndexOf("@") + 1).toLowerCase();
  return /(^|\.)(test|example|invalid|localhost)$/.test(d) || /(^|\.)example\.(com|org|net)$/.test(d);
}

/** Where a real email for this address may go: itself, the demo inbox (fictional people), or nowhere. */
export function realDestination(address: string): { to: string; redirected: boolean } | null {
  if (!address) return null;
  if (isFictionalAddress(address)) return env.demoInbox ? { to: env.demoInbox, redirected: true } : null;
  return { to: address.trim().toLowerCase(), redirected: false };
}

async function postmark(e: OutboundEmail): Promise<string> {
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "X-Postmark-Server-Token": env.postmarkToken },
    body: JSON.stringify({
      From: `"${e.fromName.replace(/"/g, "")}" <${e.kind === "signin_code" ? "signin" : "intros"}@${env.fromDomain}>`,
      To: e.toAddress,
      ReplyTo: e.replyTo || undefined,
      Subject: e.subject,
      HtmlBody: e.html,
      TextBody: e.text,
      MessageStream: "outbound",
      Tag: e.kind,
      Metadata: e.introId ? { intro_id: e.introId } : undefined,
      TrackOpens: false,
    }),
  });
  if (!res.ok) throw new EmailDeliveryError(`postmark ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { MessageID: string }).MessageID;
}

// Gmail SMTP (EMAIL_PROVIDER=gmail). Sends as the configured account, with the person's name as display name.
let gmailTransport: import("nodemailer").Transporter | null = null;
async function gmail(e: OutboundEmail): Promise<string> {
  if (!gmailTransport) {
    const nodemailer = await import("nodemailer");
    gmailTransport = nodemailer.createTransport({ service: "gmail", auth: { user: env.gmailUser, pass: env.gmailAppPassword } });
  }
  const info = await gmailTransport.sendMail({
    from: { name: e.fromName.replace(/"/g, ""), address: env.gmailUser },
    to: e.toAddress,
    // Intro emails: replies can't reach Venn without an inbound service, so don't set the relay address.
    replyTo: e.replyTo && !e.replyTo.includes(env.replyDomain) && !parseRelayToken(e.replyTo) ? e.replyTo : undefined,
    subject: e.subject,
    html: e.html,
    text: e.text,
  });
  return `gmail-${info.messageId}`;
}

async function toSandbox(e: OutboundEmail): Promise<string> {
  await sql`
    insert into sandbox_emails (intro_id, mailbox, to_profile_id, to_label, from_name, reply_to_label, subject, html, text_body, kind)
    values (${e.introId}, ${e.mailbox}, ${e.toProfileId}, ${e.toLabel ?? null}, ${e.fromName}, ${e.replyToLabel}, ${e.subject}, ${e.html}, ${e.text}, ${e.kind})`;
  return `sandbox-${randomToken(12)}`;
}

async function sendWithRetry(e: OutboundEmail): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return env.emailProvider === "gmail" ? await gmail(e) : await postmark(e);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
  }
  throw new EmailDeliveryError(`Email provider unavailable: ${(lastErr as Error)?.message}`);
}

/** Sends one email and returns the provider message id (or a sandbox id). */
export async function deliver(e: OutboundEmail): Promise<string> {
  const dest = realDestination(e.toAddress);
  const allowed = dest && (env.emailMode === "live" || env.sandboxAllowlist.includes(dest.to));
  const real = allowed && env.emailProviderReady ? dest : null;

  let sandboxId: string | null = null;
  if (env.emailMode === "sandbox" || !dest) {
    // Sign-in codes are secrets: only shown in /dev/inbox when explicitly enabled (on in development).
    if (e.kind !== "signin_code" || env.showSigninCodes) sandboxId = await toSandbox(e);
  }
  if (!real) {
    if (env.emailMode === "sandbox" && dest && !allowed) console.info(`[email] sandboxed ${e.kind} (recipient not on EMAIL_SANDBOX_ALLOWLIST)`);
    return sandboxId ?? `sandbox-skipped-${randomToken(8)}`;
  }
  const out = real.redirected
    ? { ...e, toAddress: real.to, subject: `[Demo · to ${e.toName ?? e.toLabel ?? "a demo member"}] ${e.subject}` }
    : { ...e, toAddress: real.to };
  try {
    return await sendWithRetry(out);
  } catch (err) {
    if (sandboxId) {
      console.warn("[email] real send failed; the sandbox copy is still in /dev/inbox:", (err as Error).message);
      return sandboxId;
    }
    throw err;
  }
}
