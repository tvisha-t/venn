// Intro requests: draft → (user clicks Send) → sent → replied | not_interested | no_response (§8.3).
import { sql } from "./db";
import { audit } from "./audit";
import { emailHash, randomToken, signLink, verifyLink, type LinkAction } from "./crypto";
import { flagBounced, resolveRecipientAddress } from "./contact";
import { getOwnProfile, getPublicProfile, getPublicProfiles } from "./profiles";
import { HttpError } from "./http";
import { draftIntro, rewriteIntro, senderContext } from "./agent/draft";
import { deliver, relayAddress } from "./email/provider";
import { connectedEmail, introEmail, replyForwardEmail, stripReply } from "./email/templates";
import { suggestNextBest } from "./agent/orchestrator";
import type { ParsedGoal } from "./agent/parse";

export type IntroStatus = "draft" | "sent" | "replied" | "not_interested" | "no_response" | "bounced" | "suppressed";

// ---------------------------------------------------------------- state machine
const TRANSITIONS: Record<IntroStatus, Partial<Record<string, IntroStatus>>> = {
  draft: { send: "sent", suppress: "suppressed" },
  sent: { reply: "replied", decline: "not_interested", timeout: "no_response", bounce: "bounced" },
  no_response: { reply: "replied", decline: "not_interested" }, // late reply after no_response → replied
  not_interested: { reply: "replied" }, // they changed their mind and wrote back
  replied: {},
  bounced: {},
  suppressed: {},
};

export function nextStatus(from: IntroStatus, event: "send" | "suppress" | "reply" | "decline" | "timeout" | "bounce"): IntroStatus | null {
  return TRANSITIONS[from]?.[event] ?? null;
}

export const REMINDER_AFTER_DAYS = 5;
export const NO_RESPONSE_AFTER_DAYS = 10; // 5 days after the one reminder

// ---------------------------------------------------------------- drafting
async function assertCanContact(senderId: string, recipientId: string) {
  if (senderId === recipientId) throw new HttpError(400, "You can't send an intro to yourself.");
  const recipient = await getPublicProfile(recipientId);
  if (!recipient) throw new HttpError(404, "This person isn't available on Venn.");
  if (!recipient.acceptingIntros) throw new HttpError(409, "Not accepting intros.", "not_accepting");
  const [supp] = await sql`
    select 1 from suppression_list s join profiles p on p.aa_constituent_id = s.aa_constituent_id where p.id = ${recipientId} limit 1`;
  if (supp) throw new HttpError(409, "Not accepting intros.", "not_accepting");
  const [open] = await sql`select status from intro_requests where sender_profile_id = ${senderId} and recipient_profile_id = ${recipientId}
    and status in ('sent', 'replied') limit 1`;
  if (open?.status === "sent") throw new HttpError(409, "You already have an open intro with this person.", "already_open");
  if (open?.status === "replied") throw new HttpError(409, "You're already connected — check your email for their reply.", "already_connected");
  return recipient;
}

export async function createDraft(senderId: string, recipientId: string, goalId: string | null) {
  const recipient = await assertCanContact(senderId, recipientId);
  const sender = await getOwnProfile(senderId);
  let goalText = "a quick conversation about your path after Georgia Tech";
  let ask = "15-minute call";
  if (goalId) {
    const [g] = await sql`select raw_text, parsed from goals where id = ${goalId} and owner_profile_id = ${senderId}`;
    if (g) { goalText = g.raw_text; ask = (g.parsed as ParsedGoal).ask_type || ask; }
  }
  // reuse an existing draft for this pair
  const [existing] = await sql`select id from intro_requests where sender_profile_id = ${senderId} and recipient_profile_id = ${recipientId} and status = 'draft' limit 1`;
  const d = await draftIntro(sender, recipient, { raw: goalText, ask });
  let id: string;
  if (existing) {
    await sql`update intro_requests set subject = ${d.subject}, message = ${d.body}, goal_id = ${goalId} where id = ${existing.id}`;
    id = existing.id;
  } else {
    const [row] = await sql`
      insert into intro_requests (sender_profile_id, recipient_profile_id, goal_id, subject, message, status, relay_token)
      values (${senderId}, ${recipientId}, ${goalId}, ${d.subject}, ${d.body}, 'draft', ${randomToken(32)}) returning id`;
    id = row.id;
  }
  return { introId: id, subject: d.subject, body: d.body, source: d.source, recipient, senderContext: senderContext(sender) };
}

export async function rewriteDraft(senderId: string, introId: string, mode: "shorter" | "warmer", current?: { subject: string; body: string }) {
  const [i] = await sql`select subject, message from intro_requests where id = ${introId} and sender_profile_id = ${senderId} and status = 'draft'`;
  if (!i) throw new HttpError(404, "Draft not found");
  const sender = await getOwnProfile(senderId);
  const d = await rewriteIntro(current ?? { subject: i.subject, body: i.message }, mode, sender);
  await sql`update intro_requests set subject = ${d.subject}, message = ${d.body} where id = ${introId}`;
  return { subject: d.subject, body: d.body, source: d.source };
}

// ---------------------------------------------------------------- send (requires explicit user click)
export async function sendIntro(senderId: string, actorUserId: string, introId: string, final: { subject: string; body: string; userConfirmed: true }) {
  if (final.userConfirmed !== true) throw new HttpError(400, "Sending requires an explicit click.");
  const [i] = await sql`select * from intro_requests where id = ${introId} and sender_profile_id = ${senderId}`;
  if (!i) throw new HttpError(404, "Draft not found");
  if (i.status !== "draft") throw new HttpError(409, "This intro was already sent.", "already_sent");
  const recipient = await assertCanContact(senderId, i.recipient_profile_id);
  const sender = await getOwnProfile(senderId);
  if (!sender.summaryApproved) throw new HttpError(403, "Approve your profile before sending intros.", "profile_unapproved");

  const body = final.body.replace(/\S+@\S+\.\S+/g, "").replace(/https?:\/\/\S+/g, "").trim();
  if (body.length < 20) throw new HttpError(400, "Your message is too short.");
  const words = body.split(/\s+/).length;
  if (words > 150) throw new HttpError(400, "Please keep intros under ~120 words.");
  const subject = final.subject.trim().slice(0, 80) || "Hello from a fellow Yellow Jacket";

  const actor = `user:${actorUserId}`;
  const addr = await resolveRecipientAddress(recipient.id, actor, "intro.send");
  if (!addr.ok) {
    if (addr.reason === "no_address") {
      await sql`update intro_requests set status = 'suppressed', subject = ${subject}, message = ${body} where id = ${introId}`;
      return { status: "suppressed" as const, message: body, recipient };
    }
    throw new HttpError(409, "Not accepting intros.", "not_accepting");
  }

  const unclaimed = recipient.status === "unclaimed";
  const token: string = i.relay_token;
  const email = introEmail({
    senderFirstName: sender.firstName, senderContext: senderContext(sender), subject, message: body, unclaimed,
    links: introLinks(token),
  });

  // Claim the row first so a double click can't send twice.
  const [claimed] = await sql`update intro_requests set status = 'sent', subject = ${subject}, message = ${body}, sent_at = now()
    where id = ${introId} and status = 'draft' returning id`;
  if (!claimed) throw new HttpError(409, "This intro was already sent.", "already_sent");
  try {
    const msgId = await deliver({
      introId, mailbox: "recipient", toProfileId: recipient.id, toAddress: addr.address, toName: `${recipient.firstName} ${recipient.lastName}`,
      fromName: `${sender.firstName} via Venn`, replyTo: relayAddress(token), replyToLabel: "Venn relay (reply to connect)",
      subject: email.subject, html: email.html, text: email.text, kind: "intro",
    });
    await sql`insert into relay_messages (intro_id, direction, provider_message_id) values (${introId}, 'outbound', ${msgId})`;
  } catch {
    await sql`update intro_requests set status = 'draft', sent_at = null where id = ${introId}`;
    throw new HttpError(503, "We couldn't reach the email service. Your draft is saved — try again in a minute.");
  }
  await audit(actor, "intro.send", introId, { recipient: recipient.id, unclaimed });
  return { status: "sent" as const };
}

// ---------------------------------------------------------------- inbound relay
export function introLinks(token: string) {
  return {
    connect: `/r/${signLink(token, "connect")}/connect`,
    decline: `/r/${signLink(token, "decline")}/decline`,
    claim: `/r/${signLink(token, "claim")}/claim`,
    remove: `/r/${signLink(token, "remove")}/remove`,
  };
}

/**
 * Inbound relay reply. `fromAddress` + `requireFrom` (set for real provider webhooks): the reply must come from
 * the recipient's own address (or the demo inbox, for a fictional recipient). Auto-replies are ignored.
 * A reply counts as "connect": both people get each other's email.
 */
export async function processInbound(input: { to: string; providerMessageId: string; text: string; fromAddress?: string; requireFrom?: boolean; autoReply?: boolean }) {
  const { parseRelayToken, realDestination } = await import("./email/provider");
  const token = parseRelayToken(input.to);
  if (!token) return { ok: false as const, reason: "no_token" };
  const [i] = await sql`select * from intro_requests where relay_token = ${token}`;
  if (!i) return { ok: false as const, reason: "unknown_intro" };
  if (input.autoReply) return { ok: true as const, duplicate: false, ignored: "auto_reply", introId: i.id as string };

  if (input.requireFrom) {
    const expected = await resolveRecipientAddress(i.recipient_profile_id, "system:relay", "inbound.verify_sender");
    const dest = expected.ok ? realDestination(expected.address) : null;
    const from = (input.fromAddress ?? "").trim().toLowerCase();
    if (!dest || !from || from !== dest.to) {
      await audit("system:relay", "email.inbound_rejected", i.id, { reason: "sender_mismatch" });
      return { ok: false as const, reason: "sender_mismatch" };
    }
  }

  // idempotency: webhooks retry
  const ins = await sql`insert into relay_messages (intro_id, direction, provider_message_id) values (${i.id}, 'inbound', ${input.providerMessageId})
    on conflict (provider_message_id) do nothing returning id`;
  if (!ins.length) return { ok: true as const, duplicate: true, introId: i.id as string };

  const preview = stripReply(input.text);
  const next = nextStatus(i.status, "reply");
  const first = Boolean(next);
  if (next) {
    await sql`update intro_requests set status = ${next}, replied_at = now(), reply_preview = ${preview}, sender_seen_reply = false where id = ${i.id}`;
    await audit("system:relay", "intro.connect", i.id, { via: "reply" });
  }
  await shareContacts(i, stripReply(input.text) || input.text.slice(0, 2000), first);
  return { ok: true as const, duplicate: false, introId: i.id as string, firstReply: first };
}

/** "Reply to connect" button (POST from the confirm page). Idempotent. */
export async function connectByLink(signed: string) {
  const r = await introFromLink(signed, "connect");
  if ("error" in r) return r;
  const i = r.intro;
  if (i.status === "replied") return { ok: true as const, already: true };
  const next = nextStatus(i.status, "reply");
  if (!next) return { error: "closed" };
  const [won] = await sql`update intro_requests set status = ${next}, replied_at = now(), sender_seen_reply = false
    where id = ${i.id} and status = ${i.status} returning id`;
  if (!won) return { ok: true as const, already: true }; // a concurrent click got there first
  await audit("recipient", "intro.connect", i.id, { via: "link" });
  await shareContacts(i, null, true);
  return { ok: true as const, already: false };
}

/** Name shown on the connect confirm page (no contact data). */
export async function connectPreview(signed: string) {
  const r = await introFromLink(signed, "connect");
  if ("error" in r) return r;
  const [s] = await sql`select first_name, last_name from profiles where id = ${r.intro.sender_profile_id}`;
  return { senderName: s ? `${s.first_name} ${s.last_name}` : "them", status: r.intro.status as IntroStatus };
}

/**
 * The consented share: the sender gets the recipient's email (and their reply, if any); on the first connect
 * the recipient gets the sender's email and the original message. The only place addresses leave contact_points.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function shareContacts(i: any, replyText: string | null, firstConnect: boolean) {
  const people = await sql`select id, first_name, last_name from profiles where id in (${i.sender_profile_id}, ${i.recipient_profile_id})`;
  const nameOf = (id: string) => { const p = people.find((x) => x.id === id); return p ? `${p.first_name} ${p.last_name}` : "Your contact"; };
  const senderName = nameOf(i.sender_profile_id);
  const recipientName = nameOf(i.recipient_profile_id);
  const senderAddr = await resolveRecipientAddress(i.sender_profile_id, "system:relay", "intro.connect.share");
  const recipientAddr = await resolveRecipientAddress(i.recipient_profile_id, "system:relay", "intro.connect.share");
  const subject = i.subject ?? "your intro";

  if (senderAddr.ok) {
    const mail = recipientAddr.ok
      ? connectedEmail({ otherName: recipientName, otherEmail: recipientAddr.address, subject, theirMessage: replyText, messageLabel: `${recipientName.split(" ")[0]} wrote` })
      : replyForwardEmail({ recipientName, subject, replyText: replyText ?? "" });
    await deliver({
      introId: i.id, mailbox: "sender", toProfileId: i.sender_profile_id, toAddress: senderAddr.address, toName: senderName,
      fromName: `${recipientName} via Venn`,
      replyTo: recipientAddr.ok ? recipientAddr.address : relayAddress(i.relay_token),
      replyToLabel: `${recipientName}'s email (shared because they connected)`,
      subject: mail.subject, html: mail.html, text: mail.text, kind: replyText ? "reply_forward" : "connected",
    });
    await audit("system:relay", "intro.reply_forward", i.id);
  }
  if (firstConnect && senderAddr.ok && recipientAddr.ok) {
    const mail = connectedEmail({ otherName: senderName, otherEmail: senderAddr.address, subject, theirMessage: i.message, messageLabel: "Their intro" });
    await deliver({
      introId: i.id, mailbox: "recipient", toProfileId: i.recipient_profile_id, toAddress: recipientAddr.address, toName: recipientName,
      fromName: `${senderName} via Venn`, replyTo: senderAddr.address,
      replyToLabel: `${senderName}'s email (shared because you connected)`,
      subject: mail.subject, html: mail.html, text: mail.text, kind: "connected",
    });
  }
}

// ---------------------------------------------------------------- signed links (§8.4)
type LinkErr = { error: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function introFromLink(signed: string, action: LinkAction): Promise<LinkErr | { intro: any }> {
  const v = verifyLink(signed, action);
  if (!v.ok) return { error: v.reason };
  const [i] = await sql`select * from intro_requests where relay_token = ${v.relayToken}`;
  if (!i) return { error: "unknown" };
  return { intro: i };
}

export async function declineByLink(signed: string) {
  const r = await introFromLink(signed, "decline");
  if ("error" in r) return r;
  const next = nextStatus(r.intro.status, "decline");
  if (next) {
    await sql`update intro_requests set status = ${next}, sender_seen_reply = false where id = ${r.intro.id}`;
    await audit("recipient", "intro.decline", r.intro.id);
  }
  return { ok: true as const };
}

export async function removeByLink(signed: string) {
  const r = await introFromLink(signed, "remove");
  if ("error" in r) return r;
  const pid: string = r.intro.recipient_profile_id;
  await sql.begin(async (tx) => {
    const [p] = await tx`select school_id, aa_constituent_id, status from profiles where id = ${pid} for update`;
    if (!p || p.status === "removed") return; // idempotent
    const [cp] = await tx`select email_primary, email_emfl_alias from contact_points where profile_id = ${pid}`;
    const hashes = [emailHash(cp?.email_primary), emailHash(cp?.email_emfl_alias)].filter(Boolean) as string[];
    if (!hashes.length) hashes.push("");
    for (const h of hashes) {
      await tx`insert into suppression_list (school_id, email_hash, aa_constituent_id) values (${p.school_id}, ${h || null}, ${p.aa_constituent_id})`;
    }
    // Keep only suppression hashes: wipe personal fields, contact points and matches.
    await tx`delete from contact_points where profile_id = ${pid}`;
    await tx`delete from shared_contact where profile_id = ${pid}`;
    await tx`delete from goal_matches where profile_id = ${pid}`;
    await tx`update profiles set status = 'removed', first_name = 'Removed', last_name = 'person', employer = null, job_title = null,
      industry = null, city = null, state = null, country = null, lat = null, lng = null, major = null, degree = null,
      gt_programs = '{}', summary = null, embedding = null, user_id = null, updated_at = now() where id = ${pid}`;
    await tx`update intro_requests set status = 'not_interested' where recipient_profile_id = ${pid} and status = 'sent'`;
    await audit("recipient", "profile.remove", pid, {}, tx);
  });
  return { ok: true as const };
}

export async function claimTargetByLink(signed: string): Promise<LinkErr | { profileId: string; alreadyClaimed: boolean }> {
  const r = await introFromLink(signed, "claim");
  if ("error" in r) return r;
  const [p] = await sql`select id, status from profiles where id = ${r.intro.recipient_profile_id}`;
  if (!p || p.status === "removed") return { error: "removed" };
  return { profileId: p.id as string, alreadyClaimed: p.status === "claimed" };
}

// ---------------------------------------------------------------- bounces
export async function processBounce(providerMessageId: string) {
  const [m] = await sql`select intro_id from relay_messages where provider_message_id = ${providerMessageId} and direction = 'outbound'`;
  if (!m) return { ok: false };
  const [i] = await sql`select id, status, recipient_profile_id from intro_requests where id = ${m.intro_id}`;
  if (i && nextStatus(i.status, "bounce")) {
    await sql`update intro_requests set status = 'bounced' where id = ${i.id}`;
    await flagBounced(i.recipient_profile_id);
    await audit("system:email-events", "email.bounce", i.id);
  }
  return { ok: true };
}

// ---------------------------------------------------------------- reminders + no_response (cron)
export async function runReminders(now = new Date()) {
  const due = await sql`select * from intro_requests where status = 'sent' and reminder_sent_at is null
    and sent_at < ${new Date(now.getTime() - REMINDER_AFTER_DAYS * 86400_000)}`;
  let reminded = 0;
  for (const i of due) {
    const [claim] = await sql`update intro_requests set reminder_sent_at = ${now} where id = ${i.id} and reminder_sent_at is null returning id`;
    if (!claim) continue;
    const recipient = await getPublicProfile(i.recipient_profile_id);
    const addr = recipient ? await resolveRecipientAddress(i.recipient_profile_id, "system:reminders", "intro.reminder") : null;
    if (!recipient || !addr?.ok) continue;
    const sender = await getOwnProfile(i.sender_profile_id).catch(() => null);
    if (!sender) continue;
    const unclaimed = recipient.status === "unclaimed";
    const e = introEmail({
      senderFirstName: sender.firstName, senderContext: senderContext(sender), subject: i.subject ?? "Intro", message: i.message, unclaimed, reminder: true,
      links: introLinks(i.relay_token),
    });
    try {
      const msgId = await deliver({
        introId: i.id, mailbox: "recipient", toProfileId: recipient.id, toAddress: addr.address, toName: `${recipient.firstName} ${recipient.lastName}`, fromName: `${sender.firstName} via Venn`,
        replyTo: relayAddress(i.relay_token), replyToLabel: "Venn relay (reply to connect)", subject: e.subject, html: e.html, text: e.text, kind: "reminder",
      });
      await sql`insert into relay_messages (intro_id, direction, provider_message_id) values (${i.id}, 'outbound', ${msgId})`;
      await audit("system:reminders", "intro.reminder", i.id);
      reminded++;
    } catch {
      await sql`update intro_requests set reminder_sent_at = null where id = ${i.id}`; // retry next run
    }
  }
  const timedOut = await sql`update intro_requests set status = 'no_response', sender_seen_reply = false
    where status = 'sent' and reminder_sent_at is not null and reminder_sent_at < ${new Date(now.getTime() - (NO_RESPONSE_AFTER_DAYS - REMINDER_AFTER_DAYS) * 86400_000)}
    returning id`;
  return { reminded, noResponse: timedOut.length };
}

// ---------------------------------------------------------------- Requests tab
export async function listIntros(senderId: string) {
  const rows = await sql`select id, recipient_profile_id, goal_id, subject, message, status, reply_preview, sender_seen_reply,
      sent_at, reminder_sent_at, replied_at, created_at from intro_requests
    where sender_profile_id = ${senderId} and status <> 'draft' order by coalesce(replied_at, sent_at, created_at) desc`;
  // One query for all recipients (was one query per intro).
  const people = await getPublicProfiles(rows.map((r) => r.recipient_profile_id as string));
  const out = [];
  for (const r of rows) {
    const p = people.get(r.recipient_profile_id as string) ?? null;
    out.push({
      id: r.id as string,
      recipient: p ? { id: p.id, firstName: p.firstName, lastName: p.lastName, jobTitle: p.jobTitle, employer: p.employer, classYear: p.classYear, status: p.status } : null,
      goalId: r.goal_id as string | null,
      subject: r.subject as string | null,
      message: r.message as string,
      status: r.status as IntroStatus,
      replyPreview: r.reply_preview as string | null,
      unseen: !r.sender_seen_reply,
      sentAt: r.sent_at, reminderSentAt: r.reminder_sent_at, repliedAt: r.replied_at,
    });
  }
  return out;
}

export async function markIntrosSeen(senderId: string) {
  await sql`update intro_requests set sender_seen_reply = true where sender_profile_id = ${senderId} and not sender_seen_reply`;
}

export async function nextBestForIntro(senderId: string, introId: string) {
  const [i] = await sql`select goal_id from intro_requests where id = ${introId} and sender_profile_id = ${senderId}`;
  if (!i?.goal_id) return null;
  return suggestNextBest(i.goal_id, senderId);
}
