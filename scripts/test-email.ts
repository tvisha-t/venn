import "dotenv/config";
import { env } from "../src/server/env";
import { signinCodeEmail } from "../src/server/email/templates";

// Sends one sample email straight through the configured provider (no database).
// Usage: npm run email:test [-- someone@gatech.edu]   (defaults to GMAIL_USER / DEMO_INBOX_EMAIL)
async function main() {
  const to = process.argv[2] || env.demoInbox || env.gmailUser;
  if (!env.emailProviderReady) throw new Error(`EMAIL_PROVIDER=${env.emailProvider} isn't configured. For gmail, set GMAIL_USER and GMAIL_APP_PASSWORD in .env.`);
  if (!to) throw new Error("No recipient: pass an address or set DEMO_INBOX_EMAIL.");
  const mail = signinCodeEmail("123456");
  if (env.emailProvider === "gmail") {
    const nodemailer = await import("nodemailer");
    const t = nodemailer.createTransport({ service: "gmail", auth: { user: env.gmailUser, pass: env.gmailAppPassword } });
    await t.verify();
    const info = await t.sendMail({ from: { name: "Venn", address: env.gmailUser }, to, subject: `[Test] ${mail.subject}`, html: mail.html, text: mail.text });
    console.log(`✓ sent via Gmail to ${to} (${info.messageId})`);
  } else {
    const { deliver } = await import("../src/server/email/provider");
    await deliver({ introId: null, mailbox: "signin", toProfileId: null, toAddress: to, fromName: "Venn", replyTo: "", replyToLabel: "", subject: `[Test] ${mail.subject}`, html: mail.html, text: mail.text, kind: "signin_code" });
    console.log(`✓ handed to ${env.emailProvider} for ${to}`);
  }
}
main().catch((e) => { console.error("✗", e.message); process.exitCode = 1; });
