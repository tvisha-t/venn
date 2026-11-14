import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/server/db";
import { resetDatabase, seedAll } from "@/server/seed";
import { signLink, verifyLink } from "@/server/crypto";
import { createDraft, declineByLink, nextStatus, processInbound, removeByLink, runReminders, sendIntro, rewriteDraft, nextBestForIntro } from "@/server/intros";
import { relayAddress } from "@/server/email/provider";
import { stripReply } from "@/server/email/templates";
import { runGoal } from "@/server/agent/orchestrator";
import { importAlumniAssociation } from "@/server/import/aa";
import { applyKAnonymity, mapClusters } from "@/server/explore";
import { roundCoord } from "@/server/geo";
import { getPublicProfile } from "@/server/profiles";

let sender: { id: string; user: string };
let goalId: string;
const recipients: string[] = [];

beforeAll(async () => {
  await resetDatabase();
  await seedAll();
  const [s] = await sql`select p.id, p.user_id from profiles p where status='claimed' and 'student' = any(roles) and not ferpa_restricted and summary_approved order by last_name limit 1`;
  sender = { id: s.id, user: s.user_id };
  goalId = (await runGoal("GT alumni at Delta who could give advice on ops tech", sender.id, () => {}))!;
  const rows = await sql`select gm.profile_id from goal_matches gm join contact_points cp on cp.profile_id = gm.profile_id
    where gm.goal_id = ${goalId} and not cp.do_not_contact and (cp.email_primary is not null or cp.email_emfl_alias is not null)
      and not exists (select 1 from intro_requests i where i.sender_profile_id = ${sender.id} and i.recipient_profile_id = gm.profile_id)
    order by gm.rank`;
  recipients.push(...rows.map((r) => r.profile_id));
});

async function sendTo(recipientId: string) {
  const d = await createDraft(sender.id, recipientId, goalId);
  await sendIntro(sender.id, sender.user, d.introId, { subject: d.subject, body: d.body, userConfirmed: true });
  const [i] = await sql`select * from intro_requests where id = ${d.introId}`;
  return i;
}

describe("state machine (§8.3)", () => {
  it("allows only valid transitions", () => {
    expect(nextStatus("draft", "send")).toBe("sent");
    expect(nextStatus("sent", "reply")).toBe("replied");
    expect(nextStatus("sent", "decline")).toBe("not_interested");
    expect(nextStatus("sent", "timeout")).toBe("no_response");
    expect(nextStatus("no_response", "reply")).toBe("replied"); // late reply
    expect(nextStatus("replied", "decline")).toBeNull();
    expect(nextStatus("draft", "reply")).toBeNull();
  });
});

describe("signed links (§8.4)", () => {
  it("verifies, rejects tampering and wrong action, and expires after 60 days", () => {
    const t = "a".repeat(43);
    const signed = signLink(t, "decline");
    expect(verifyLink(signed, "decline")).toEqual({ ok: true, relayToken: t });
    expect(verifyLink(signed, "remove").ok).toBe(false);
    expect(verifyLink(signed.replace(/.$/, "x"), "decline").ok).toBe(false);
    expect(verifyLink(signed, "decline", Date.now() + 61 * 86400_000)).toEqual({ ok: false, reason: "expired" });
    expect(verifyLink("garbage", "decline").ok).toBe(false);
  });
});

describe("intro flow (sandbox email)", () => {
  it("drafts, rewrites shorter, and sends only with explicit confirmation", async () => {
    const d = await createDraft(sender.id, recipients[0], goalId);
    expect(d.body.split(/\s+/).length).toBeLessThanOrEqual(120);
    const short = await rewriteDraft(sender.id, d.introId, "shorter");
    expect(short.body.length).toBeLessThan(d.body.length);
    // @ts-expect-error — userConfirmed must be literally true
    await expect(sendIntro(sender.id, sender.user, d.introId, { subject: "x", body: short.body, userConfirmed: false })).rejects.toThrow();
    const r = await sendIntro(sender.id, sender.user, d.introId, { subject: short.subject, body: short.body, userConfirmed: true });
    expect(r.status).toBe("sent");
    const [mail] = await sql`select * from sandbox_emails where intro_id = ${d.introId}`;
    expect(mail.kind).toBe("intro");
    expect(mail.html).toContain("Reply to connect.");
    expect(mail.html).toContain("Not interested");
    expect(mail.html).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/); // no addresses in the body
    const audits = await sql`select action from audit_log where target_id in (${d.introId}, ${recipients[0]})`;
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(["intro.send", "contact.read"]));
  });

  it("blocks a second open intro to the same person and double sends", async () => {
    await expect(createDraft(sender.id, recipients[0], goalId)).rejects.toThrow(/already have an open intro/);
  });

  it("reply flips status to replied, dedupes webhook retries, and forwards to the sender", async () => {
    const [i] = await sql`select * from intro_requests where sender_profile_id = ${sender.id} and recipient_profile_id = ${recipients[0]}`;
    const payload = { to: relayAddress(i.relay_token), providerMessageId: "pm-1", text: "Happy to chat Thursday!\n\nOn Mon, Nov 10, 2026 Jordan wrote:\n> hi" };
    const a = await processInbound(payload);
    const b = await processInbound(payload);
    expect(a).toMatchObject({ ok: true, duplicate: false });
    expect(b).toMatchObject({ ok: true, duplicate: true });
    const [after] = await sql`select status, reply_preview from intro_requests where id = ${i.id}`;
    expect(after.status).toBe("replied");
    expect(after.reply_preview).toBe("Happy to chat Thursday!");
    const fwd = await sql`select * from sandbox_emails where intro_id = ${i.id} and kind = 'reply_forward'`;
    expect(fwd.length).toBe(1);
    expect(fwd[0].mailbox).toBe("sender");
  });

  it("decline link → not_interested, idempotent, and suggests the next best match", async () => {
    const i = await sendTo(recipients[1]);
    const link = signLink(i.relay_token, "decline");
    expect(await declineByLink(link)).toEqual({ ok: true });
    expect(await declineByLink(link)).toEqual({ ok: true });
    const [after] = await sql`select status from intro_requests where id = ${i.id}`;
    expect(after.status).toBe("not_interested");
    const next = await nextBestForIntro(sender.id, i.id);
    expect(next).not.toBeNull();
    expect([recipients[0], recipients[1]]).not.toContain(next!.profile.id);
  });

  it("one reminder after 5 days, then no_response after 5 more; a late reply still flips to replied", async () => {
    const i = await sendTo(recipients[2]);
    const now = Date.now();
    await sql`update intro_requests set sent_at = ${new Date(now - 6 * 86400_000)} where id = ${i.id}`;
    const r1 = await runReminders(new Date(now));
    expect(r1.reminded).toBeGreaterThanOrEqual(1);
    const r2 = await runReminders(new Date(now));
    const reminders = await sql`select 1 from sandbox_emails where intro_id = ${i.id} and kind = 'reminder'`;
    expect(reminders.length).toBe(1); // only ever one reminder
    expect(r2.reminded).toBe(0);
    await runReminders(new Date(now + 6 * 86400_000));
    expect((await sql`select status from intro_requests where id = ${i.id}`)[0].status).toBe("no_response");
    await processInbound({ to: relayAddress(i.relay_token), providerMessageId: "pm-late", text: "Sorry for the delay — yes!" });
    expect((await sql`select status from intro_requests where id = ${i.id}`)[0].status).toBe("replied");
  });

  it("do-not-contact profiles are searchable but cannot receive intros", async () => {
    const [p] = await sql`select p.id from profiles p join contact_points cp on cp.profile_id = p.id where cp.do_not_contact and p.status = 'unclaimed' limit 1`;
    const pub = await getPublicProfile(p.id);
    expect(pub?.acceptingIntros).toBe(false);
    await expect(createDraft(sender.id, p.id, null)).rejects.toThrow(/Not accepting intros/);
  });

  it("Remove me → profile disappears, contact deleted, suppression added; re-import never brings it back", async () => {
    const unclaimed = [];
    for (const id of recipients.slice(3)) {
      const [p] = await sql`select status, aa_constituent_id from profiles where id = ${id}`;
      if (p.status === "unclaimed") unclaimed.push({ id, aa: p.aa_constituent_id });
    }
    const target = unclaimed[0];
    const i = await sendTo(target.id);
    const link = signLink(i.relay_token, "remove");
    expect(await removeByLink(link)).toEqual({ ok: true });
    expect(await removeByLink(link)).toEqual({ ok: true }); // idempotent
    expect(await getPublicProfile(target.id)).toBeNull();
    expect((await sql`select 1 from contact_points where profile_id = ${target.id}`).length).toBe(0);
    expect((await sql`select 1 from suppression_list where aa_constituent_id = ${target.aa}`).length).toBeGreaterThan(0);
    await importAlumniAssociation(readFileSync("mock-data/alumni_association_export.csv", "utf8"));
    expect((await sql`select 1 from profiles where aa_constituent_id = ${target.aa} and status <> 'removed'`).length).toBe(0);
    const g = await runGoal("GT alumni at Delta who could give advice on ops tech", sender.id, () => {});
    expect((await sql`select 1 from goal_matches where goal_id = ${g} and profile_id = ${target.id}`).length).toBe(0);
  });
});

describe("reply stripping", () => {
  it("drops quoted history, signatures and addresses", () => {
    expect(stripReply("Yes!\n-- \nJane\njane@x.com")).toBe("Yes!");
    expect(stripReply("Sure, email me at a@b.com\n\nSent from my iPhone")).toBe("Sure, email me at [email hidden]");
  });
});

describe("location privacy", () => {
  it("rounds to 2 decimals and hides small clusters at close zoom", async () => {
    expect(roundCoord(33.77561)).toBe(33.78);
    expect(applyKAnonymity([{ count: 1 }, { count: 2 }, { count: 3 }], 12)).toEqual([{ count: 3 }]);
    expect(applyKAnonymity([{ count: 1 }], 8)).toEqual([{ count: 1 }]);
    const close = await mapClusters({}, [-84.6, 33.6, -84.2, 33.95], 14, sender.id);
    expect(close.clusters.every((c) => c.count >= 3)).toBe(true);
  });
});
