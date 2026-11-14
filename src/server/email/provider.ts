// Email delivery. EMAIL_MODE=sandbox → local mailbox at /dev/inbox (stored by profile id,
// never by address). EMAIL_MODE=live → Postmark, with retry + backoff.
import { sql } from "../db";
import { env } from "../env";
import { randomToken } from "../crypto";

export type OutboundEmail = {
  introId: string | null;
  mailbox: "recipient" | "sender" | "invitee";
  toProfileId: string | null;
  toLabel?: string;           // sandbox display for people without a profile (masked email)
  toAddress: string;          // used only for live sends; never stored
  fromName: string;
  replyTo: string;            // relay address, or the consented real address on reply forwards
  replyToLabel: string;       // what the sandbox shows instead of the address
  subject: string;
  html: string;
  text: string;
  kind: "intro" | "reminder" | "reply_forward" | "notification" | "invite";
};

export class EmailDeliveryError extends Error {}

export function relayAddress(relayToken: string) {
  return `reply+${relayToken}@${env.replyDomain}`;
}

export function parseRelayToken(to: string): string | null {
  const m = to.match(/reply\+([A-Za-z0-9_-]{20,})@/);
  return m ? m[1] : null;
}

async function postmark(e: OutboundEmail): Promise<string> {
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "X-Postmark-Server-Token": env.postmarkToken },
    body: JSON.stringify({
      From: `"${e.fromName.replace(/"/g, "")}" <intros@${env.fromDomain}>`,
      To: e.toAddress,
      ReplyTo: e.replyTo,
      Subject: e.subject,
      HtmlBody: e.html,
      TextBody: e.text,
      MessageStream: "outbound",
    }),
  });
  if (!res.ok) throw new EmailDeliveryError(`postmark ${res.status}`);
  return ((await res.json()) as { MessageID: string }).MessageID;
}

/** Sends one email and returns the provider message id. Retries transient failures. */
export async function deliver(e: OutboundEmail): Promise<string> {
  if (env.emailMode === "sandbox") {
    const id = `sandbox-${randomToken(12)}`;
    await sql`
      insert into sandbox_emails (intro_id, mailbox, to_profile_id, to_label, from_name, reply_to_label, subject, html, text_body, kind)
      values (${e.introId}, ${e.mailbox}, ${e.toProfileId}, ${e.toLabel ?? null}, ${e.fromName}, ${e.replyToLabel}, ${e.subject}, ${e.html}, ${e.text}, ${e.kind})`;
    return id;
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await postmark(e);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
  }
  throw new EmailDeliveryError(`Email provider unavailable: ${(lastErr as Error)?.message}`);
}
