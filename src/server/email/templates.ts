// Recipient email templates (§8.1): navy band, message, sender context, actions.
// Emails can't use CSS variables, so the light-theme token values are inlined here.
import { env } from "../env";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const paras = (s: string) => esc(s).split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br>")}</p>`).join("");

// Light tokens (VENN_RESTYLE_INSTRUCTIONS)
const T = {
  canvas: "#f6f8fa", surface: "#ffffff", raised: "#eef2f6", text: "#0d1b2a", muted: "#4f5559", subtle: "#5c6267",
  line: "#e1e7ed", control: "#7d878f", primary: "#003057", accent: "#eaaa00", accentText: "#7a6418", link: "#00426f", highlight: "#f5d77e",
};
const FONT = "'Plus Jakarta Sans',Helvetica,Arial,sans-serif";

// Mark as a PNG (white strokes, gold overlap): Gmail and Outlook strip inline SVG.
const LOGO_IMG_TAG = () =>
  `<img src="${env.appUrl}/venn-mark-white-2x.png" width="28" height="28" alt="" style="display:inline-block;vertical-align:middle;margin-right:8px;border:0">`;

function shell(eyebrow: string, inner: string, footer = "") {
  const LOGO_IMG = LOGO_IMG_TAG();
  return `<!doctype html><html><body style="margin:0;background:${T.canvas};font-family:${FONT};color:${T.text}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${T.canvas}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${T.surface};border:1px solid ${T.line};border-radius:20px;overflow:hidden">
<tr><td style="background:${T.primary};height:72px;padding:0 32px;border-radius:20px 20px 0 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font:800 26px/1 ${FONT};letter-spacing:-0.04em;color:#ffffff;white-space:nowrap">${LOGO_IMG}<span style="vertical-align:middle">venn</span></td>
    <td align="right" style="font:700 12px/16px ${FONT};letter-spacing:0.08em;text-transform:uppercase;color:${T.accent}">${esc(eyebrow)}</td>
  </tr></table>
</td></tr>
<tr><td style="padding:32px;font-size:15px;line-height:24px;color:${T.text}">${inner}</td></tr>
</table>
${footer ? `<p style="max-width:520px;margin:16px auto 0;font:400 12px/18px ${FONT};color:${T.subtle};text-align:center">${footer}</p>` : ""}
</td></tr></table></body></html>`;
}

/** Bulletproof 44px button. */
const btn = (href: string, label: string, primary = false) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;margin:0 8px 8px 0"><tr><td style="border-radius:12px;${
    primary ? `background:${T.primary}` : `background:${T.surface};border:1px solid ${T.control}`
  }"><a href="${esc(href)}" style="display:inline-block;padding:11px 20px;font:600 15px/22px ${FONT};text-decoration:none;color:${primary ? "#ffffff" : T.text}">${esc(label)}</a></td></tr></table>`;

const footLink = (href: string, label: string) => `<a href="${esc(href)}" style="color:${T.link};text-decoration:underline">${esc(label)}</a>`;

export type IntroEmailInput = {
  senderFirstName: string;
  senderContext: string; // "CS '28 · Georgia Tech"
  subject: string;
  message: string;
  unclaimed: boolean;
  links: { decline: string; connect?: string; claim?: string; remove?: string };
  reminder?: boolean;
};

export function introEmail(i: IntroEmailInput) {
  const url = (p: string) => `${env.appUrl}${p}`;
  const cobrand = i.unclaimed && env.coBrandAA ? `<p style="margin:0 0 12px;color:${T.subtle};font-size:13px">Sent via Georgia Tech records</p>` : "";
  const reminderNote = i.reminder ? `<p style="margin:0 0 16px;padding:10px 14px;background:${T.raised};border-radius:12px;color:${T.muted};font-size:14px;line-height:20px">A gentle reminder: ${esc(i.senderFirstName)} reached out a few days ago. This is the only reminder you'll get.</p>` : "";
  const footer = [
    `${esc(env.appName)} connects the Georgia Tech community and is independent, not run by Georgia Tech.`,
    i.unclaimed ? " You're listed because of your Georgia Tech record." : "",
    " We never show your email to anyone unless you reply.",
    i.unclaimed && i.links.remove ? `<br>${footLink(url(i.links.remove), "Remove me from Venn")}` : "",
  ].join("");
  const html = shell(i.reminder ? "Reminder" : "Intro request", `
    ${cobrand}${reminderNote}
    <p style="margin:0 0 16px"><strong>${esc(i.senderFirstName)}</strong>, ${esc(i.senderContext)}, asked Venn to introduce you.</p>
    <div style="background:${T.raised};border-radius:12px;padding:20px;margin:0 0 20px">
      <p style="margin:0 0 8px;font-size:13px;line-height:18px;font-weight:700">${esc(i.senderFirstName)} wrote</p>
      ${paras(i.message)}
    </div>
    <p style="margin:0 0 4px;font-size:16px;font-weight:700">Reply to connect.</p>
    <p style="margin:0 0 16px;font-size:14px;line-height:20px;color:${T.muted}">${i.links.connect ? (env.canReceiveReplies ? "Tap the button or just reply to this email." : "Tap the button below.") : "Just reply to this email."} Connecting shares your email address with ${esc(i.senderFirstName)} and theirs with you. Not interested? One click and nothing is shared.</p>
    <div>
      ${i.links.connect ? btn(url(i.links.connect), "Reply to connect", true) : ""}
      ${btn(url(i.links.decline), "Not interested")}
      ${i.unclaimed && i.links.claim ? btn(url(i.links.claim), "Claim your profile", true) : ""}
    </div>
    ${i.unclaimed && i.links.claim ? `<p style="margin:8px 0 0;font-size:14px;line-height:20px;color:${T.muted}"><strong style="color:${T.text}">Claim your profile in 30 seconds:</strong> import it from LinkedIn (PDF or data export), choose what to show, and approve. Nothing goes public until you do.</p>` : ""}
  `, footer);
  const text = [
    i.reminder ? `A gentle reminder: ${i.senderFirstName} reached out a few days ago. This is the only reminder you'll get.\n` : "",
    `${i.senderFirstName}, ${i.senderContext}, asked Venn to introduce you.\n`,
    i.message,
    `\n---\nReply to connect: ${i.links.connect ? `${url(i.links.connect)}${env.canReceiveReplies ? " (or just reply to this email)" : ""}` : "just reply to this email"}. Connecting shares your email address with ${i.senderFirstName} and theirs with you.`,
    `Not interested: ${url(i.links.decline)}`,
    i.unclaimed && i.links.claim ? `Claim your profile (import from LinkedIn in 30 seconds): ${url(i.links.claim)}` : "",
    i.unclaimed && i.links.remove ? `Remove me from Venn: ${url(i.links.remove)}` : "",
  ].filter(Boolean).join("\n");
  return { subject: i.reminder ? `Re: ${i.subject}` : i.subject, html, text };
}

export function replyForwardEmail(i: { recipientName: string; subject: string; replyText: string }) {
  const html = shell("You're connected", `
    <p style="margin:0 0 16px;font-size:22px;line-height:28px;font-weight:800">${esc(i.recipientName)} replied. You're connected!</p>
    <div style="background:${T.raised};border-radius:12px;padding:20px;margin:0 0 16px">
      <p style="margin:0 0 8px;font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${T.accentText}">${esc(i.recipientName.split(" ")[0])} wrote</p>
      ${paras(i.replyText)}
    </div>
    <p style="margin:0;font-size:14px;line-height:20px;color:${T.muted}">${esc(i.recipientName)} chose to share their email by replying. Hit reply to continue the conversation directly. Tip: reply within a day and say thanks after you meet.</p>`);
  const text = `${i.recipientName} replied to your intro:\n\n${i.replyText}\n\n${i.recipientName} chose to share their email by replying. Hit reply to continue directly.`;
  return { subject: `Re: ${i.subject}`, html, text };
}

/**
 * "You're connected" (sent to BOTH people when the recipient connects). This is the only email that
 * carries the other person's address: the consented share.
 */
export function connectedEmail(i: { otherName: string; otherEmail: string; otherContext?: string; subject: string; theirMessage?: string | null; messageLabel: string }) {
  const first = i.otherName.split(" ")[0];
  const html = shell("You're connected", `
    <p style="margin:0 0 8px;font-size:22px;line-height:28px;font-weight:800">You're connected with ${esc(i.otherName)}!</p>
    ${i.otherContext ? `<p style="margin:0 0 16px;color:${T.muted}">${esc(i.otherContext)}</p>` : ""}
    <div style="border:1px solid ${T.line};border-radius:12px;padding:16px 20px;margin:0 0 16px">
      <p style="margin:0 0 4px;font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${T.accentText}">${esc(first)}'s email</p>
      <p style="margin:0;font:600 17px/24px ${FONT}"><a href="mailto:${esc(i.otherEmail)}" style="color:${T.link}">${esc(i.otherEmail)}</a></p>
    </div>
    ${i.theirMessage ? `<div style="background:${T.raised};border-radius:12px;padding:20px;margin:0 0 16px">
      <p style="margin:0 0 8px;font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${T.accentText}">${esc(i.messageLabel)}</p>
      ${paras(i.theirMessage)}
    </div>` : ""}
    <p style="margin:0;font-size:14px;line-height:20px;color:${T.muted}">Hit reply to write to ${esc(first)} directly. Venn isn't in the thread from here. Tip: reply within a day and say thanks after you meet.</p>`);
  const text = [
    `You're connected with ${i.otherName}!`,
    i.otherContext ?? "",
    `${first}'s email: ${i.otherEmail}`,
    i.theirMessage ? `\n${i.messageLabel}:\n${i.theirMessage}\n` : "",
    `Hit reply to write to ${first} directly. Venn isn't in the thread from here.`,
  ].filter(Boolean).join("\n");
  return { subject: `You're connected: ${i.subject}`, html, text };
}

/** Sent right after a transcript/diploma verification is approved. */
export function verifiedEmail(i: { method: "etranscript" | "diploma_photo"; signInUrl: string }) {
  const doc = i.method === "etranscript" ? "transcript" : "diploma";
  const html = shell("You're verified", `
    <p style="margin:0 0 12px;font-size:22px;line-height:28px;font-weight:800">You're verified. Welcome, Jacket!</p>
    <p style="margin:0 0 20px">Your ${doc} was approved. Sign in to Venn with this email address: we'll send you a 6-digit code, no password needed.</p>
    ${btn(i.signInUrl, "Sign in to Venn", true)}
    <p style="margin:12px 0 0;font-size:14px;line-height:20px;color:${T.muted}">Your ${doc} was deleted after the check. Only a "Verified · ${doc}" badge appears on your profile.</p>`,
    `Didn't ask to join Venn? Ignore this email. Venn is independent and not run by Georgia Tech.`);
  const text = `You're verified. Your ${doc} was approved.\n\nSign in to Venn with this email address (we'll send a 6-digit code): ${i.signInUrl}\n\nYour ${doc} was deleted after the check.`;
  return { subject: "You're verified on Venn", html, text };
}

/** 6-digit sign-in code. */
export function signinCodeEmail(code: string) {
  const html = shell("Sign-in code", `
    <p style="margin:0 0 16px;font-size:22px;line-height:28px;font-weight:800">Your Venn sign-in code</p>
    <p style="margin:0 0 16px">Enter this code to finish signing in. It works once and expires in 10 minutes.</p>
    <p style="margin:0 0 20px;padding:16px 20px;background:${T.raised};border-radius:12px;font:500 32px/40px 'Geist Mono',ui-monospace,Menlo,monospace;letter-spacing:0.3em;text-align:center;color:${T.text}">${esc(code)}</p>
    <p style="margin:0;font-size:14px;line-height:20px;color:${T.muted}">Didn't try to sign in? Ignore this email. Nobody can sign in without this code.</p>`);
  const text = `Your Venn sign-in code: ${code}\n\nIt works once and expires in 10 minutes.\nDidn't try to sign in? Ignore this email.`;
  return { subject: "Your Venn sign-in code", html, text };
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


/** Member invite. The invitee's address is used only to send this one email. */
export function inviteEmail(i: { inviterFirstName: string; inviterContext: string; note: string | null; joinUrl: string; stopUrl: string }) {
  const html = shell("Invite", `
    <p style="margin:0 0 12px;font-size:22px;line-height:28px;font-weight:800">${esc(i.inviterFirstName)} invited you to venn</p>
    <p style="margin:0 0 16px">Venn helps Georgia Tech students, alumni, faculty and staff find each other: type what you need, and Venn finds the Yellow Jackets who can help and introduces you by email.</p>
    ${i.note ? `<div style="background:${T.raised};border-radius:12px;padding:20px;margin:0 0 20px"><p style="margin:0 0 8px;font-size:13px;line-height:18px;font-weight:700">${esc(i.inviterFirstName)} wrote</p>${paras(i.note)}<p style="margin:0;color:${T.muted};font-size:14px">— ${esc(i.inviterFirstName)} · ${esc(i.inviterContext)}</p></div>` : ""}
    ${btn(i.joinUrl, "Join with your school email", true)}
    <p style="margin:8px 0 0;font-size:14px;line-height:20px;color:${T.muted}">Set up your profile in 30 seconds by importing it from LinkedIn. You choose what to show.</p>`,
    `You got this because a Georgia Tech member entered your email. We don't keep your address. ${footLink(i.stopUrl, "Don't send me invites")}. Venn is independent and not run by Georgia Tech.`);
  const text = [
    `${i.inviterFirstName} invited you to venn.`,
    "Venn helps the Georgia Tech community find each other and introduces you by email.",
    i.note ? `\n"${i.note}"\n— ${i.inviterFirstName} · ${i.inviterContext}\n` : "",
    `Join with your school email: ${i.joinUrl}`,
    "Set up your profile in 30 seconds by importing it from LinkedIn.",
    `\nYou got this because a Georgia Tech member entered your email. We don't keep your address. Don't send me invites: ${i.stopUrl}`,
  ].filter(Boolean).join("\n");
  return { subject: `${i.inviterFirstName} invited you to venn`, html, text };
}
