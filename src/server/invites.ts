// "Invite a Yellow Jacket". The invitee's address is used once, to send one email, and is
// never stored: we keep only sha256(lowercased email) to stop repeat invites and to honor
// "Don't send me invites". The response is identical whether or not an email was sent,
// so this endpoint can't be used to find out who is on Venn.
import { sql } from "./db";
import { audit } from "./audit";
import { emailHash, signLink } from "./crypto";
import { env } from "./env";
import { deliver } from "./email/provider";
import { inviteEmail } from "./email/templates";
import { getOwnProfile } from "./profiles";
import { senderContext } from "./agent/draft";
import { HttpError } from "./http";

export const INVITE_COOLDOWN_DAYS = 30;

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
}

export type InviteOutcome = "sent" | "skipped_member" | "skipped_optout" | "skipped_recent" | "skipped_suppressed";

export async function sendInvite(inviterProfileId: string, inviterUserId: string, rawEmail: string, rawNote?: string | null): Promise<InviteOutcome> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) throw new HttpError(400, "Enter a valid email address.");
  const note = rawNote?.trim()
    ? rawNote.trim().replace(/\S+@\S+\.\S+/g, "").replace(/https?:\/\/\S+/g, "").slice(0, 300)
    : null;
  const inviter = await getOwnProfile(inviterProfileId);
  if (!inviter.summaryApproved) throw new HttpError(403, "Approve your profile before inviting people.");
  const hash = emailHash(email)!;

  const [optout] = await sql`select 1 from invite_optouts where email_hash = ${hash}`;
  if (optout) return "skipped_optout";
  const [supp] = await sql`select 1 from suppression_list where email_hash = ${hash}`;
  if (supp) return "skipped_suppressed";
  const [member] = await sql`select 1 from users where lower(login_email) = ${email}`;
  if (member) return "skipped_member";
  const [recent] = await sql`select 1 from invites where email_hash = ${hash}
    and created_at > now() - make_interval(days => ${INVITE_COOLDOWN_DAYS})`;
  if (recent) return "skipped_recent";

  const e = inviteEmail({
    inviterFirstName: inviter.firstName,
    inviterContext: senderContext(inviter),
    note,
    joinUrl: `${env.appUrl}/signin`,
    stopUrl: `${env.appUrl}/r/${signLink(hash, "noinvite")}/noinvite`,
  });
  await deliver({
    introId: null, mailbox: "invitee", toProfileId: null, toLabel: maskEmail(email), toAddress: email,
    fromName: `${inviter.firstName} via Venn`, replyTo: `no-reply@${env.fromDomain}`, replyToLabel: "No reply (invites aren't a chat)",
    subject: e.subject, html: e.html, text: e.text, kind: "invite",
  });
  await sql`insert into invites (inviter_profile_id, email_hash) values (${inviterProfileId}, ${hash})`;
  await audit(`user:${inviterUserId}`, "invite.send", null, {}); // no address, no hash in the log
  return "sent";
}

/** "Don't send me invites" (signed link carries only the hash). Idempotent. */
export async function optOutOfInvites(hash: string) {
  if (!/^[0-9a-f]{64}$/.test(hash)) return false;
  await sql`insert into invite_optouts (email_hash) values (${hash}) on conflict do nothing`;
  await audit("recipient", "invite.optout", null);
  return true;
}
