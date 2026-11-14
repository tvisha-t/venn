// Recipient email templates (§8.1, §12.2 #9): thin plum rule, message, sender context, actions.
import { env } from "../env";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const paras = (s: string) => esc(s).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`).join("");

const BRAND = "#7A3E6A";
const RULE = "#7A3E6A";
const INK = "#17131A";
const GRAY = "#625A66";

function shell(inner: string) {
  return `<!doctype html><html><body style="margin:0;background:#F8F4F7;font-family:'Plus Jakarta Sans',Arial,sans-serif;color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;border:1px solid #ECE3E9">
<tr><td style="border-top:3px solid ${RULE};border-radius:12px 12px 0 0;padding:24px 28px;font-size:15px;line-height:1.55">${inner}</td></tr>
</table></td></tr></table></body></html>`;
}

const btn = (href: string, label: string, primary = false) =>
  `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:9px 14px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;${
    primary ? `background:${BRAND};color:#fff` : `border:1px solid #ECE3E9;color:${BRAND};background:#fff`
  }">${esc(label)}</a>`;

export type IntroEmailInput = {
  senderFirstName: string;
  senderContext: string; // "CS '28 · Georgia Tech"
  subject: string;
  message: string;
  unclaimed: boolean;
  links: { decline: string; claim?: string; remove?: string };
  reminder?: boolean;
};

export function introEmail(i: IntroEmailInput) {
  const url = (p: string) => `${env.appUrl}${p}`;
  const cobrand = i.unclaimed && env.coBrandAA ? `<p style="margin:0 0 12px;color:${GRAY};font-size:13px">Sent via the GT Alumni Association</p>` : "";
  const reminderNote = i.reminder ? `<p style="margin:0 0 14px;color:${GRAY};font-size:13px">A gentle reminder: ${esc(i.senderFirstName)} reached out a few days ago. This is the only reminder you'll get.</p>` : "";
  const html = shell(`
    ${cobrand}${reminderNote}
    ${paras(i.message)}
    <p style="margin:4px 0 18px;color:${GRAY};font-size:14px">— ${esc(i.senderFirstName)} · ${esc(i.senderContext)}</p>
    <div style="border-top:1px solid ${RULE};padding-top:16px">
      <p style="margin:0 0 12px;font-weight:600">Reply to connect.</p>
      <p style="margin:0 0 14px;font-size:14px;color:${GRAY}">Replying to this email shares your email address with ${esc(i.senderFirstName)}. Not interested? One click and nothing is shared.</p>
      ${btn(url(i.links.decline), "Not interested")}
      ${i.unclaimed && i.links.claim ? btn(url(i.links.claim), "Claim your profile") : ""}
      ${i.unclaimed && i.links.remove ? btn(url(i.links.remove), "Remove me from Venn") : ""}
    </div>
    <p style="margin:18px 0 0;font-size:12px;color:${GRAY}">${esc(env.appName)} connects the Georgia Tech community. ${i.unclaimed ? "You're listed because of your Georgia Tech Alumni Association record. " : ""}We never show your email to anyone unless you reply.</p>
  `);
  const text = [
    i.reminder ? `A gentle reminder: ${i.senderFirstName} reached out a few days ago. This is the only reminder you'll get.\n` : "",
    i.message,
    `\n— ${i.senderFirstName} · ${i.senderContext}`,
    `\n---\nReply to connect. Replying shares your email address with ${i.senderFirstName}.`,
    `Not interested: ${url(i.links.decline)}`,
    i.unclaimed && i.links.claim ? `Claim your profile: ${url(i.links.claim)}` : "",
    i.unclaimed && i.links.remove ? `Remove me from Venn: ${url(i.links.remove)}` : "",
  ].filter(Boolean).join("\n");
  return { subject: i.reminder ? `Re: ${i.subject}` : i.subject, html, text };
}

export function replyForwardEmail(i: { recipientName: string; subject: string; replyText: string }) {
  const html = shell(`
    <p style="margin:0 0 12px;font-weight:600">${esc(i.recipientName)} replied to your intro 🎉</p>
    <div style="border-left:3px solid ${RULE};padding:4px 0 4px 14px;margin:0 0 16px">${paras(i.replyText)}</div>
    <p style="margin:0;font-size:14px;color:${GRAY}">${esc(i.recipientName)} chose to share their email by replying. Hit reply to continue the conversation directly.</p>`);
  const text = `${i.recipientName} replied to your intro:\n\n${i.replyText}\n\n${i.recipientName} chose to share their email by replying. Hit reply to continue directly.`;
  return { subject: `Re: ${i.subject}`, html, text };
}

/** Strip quoted history and signatures for the in-app preview (§8.2). */
export function stripReply(body: string): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const l of lines) {
    if (/^\s*>/.test(l)) break;
    if (/^On .{4,200}wrote:\s*$/.test(l.trim())) break;
    if (/^-{2,}\s*$/.test(l.trim()) || /^-- $/.test(l)) break;
    if (/^(Sent from my|Get Outlook for)/i.test(l.trim())) break;
    if (/^_{5,}/.test(l.trim()) || /^From: /.test(l.trim())) break;
    out.push(l);
  }
  return out.join("\n").trim().replace(/\S+@\S+\.\S+/g, "[email hidden]").slice(0, 600);
}
