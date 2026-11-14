// Central, typed access to environment variables. Secrets come from .env only.
function opt(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  get databaseUrl() {
    const v = process.env.DATABASE_URL;
    if (!v) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
    return v;
  },
  get anthropicKey() { return opt("ANTHROPIC_API_KEY"); },
  get anthropicModel() { return opt("ANTHROPIC_MODEL", "claude-opus-5-5"); },
  get voyageKey() { return opt("VOYAGE_API_KEY"); },
  get emailMode() { return (opt("EMAIL_MODE", "sandbox") === "live" ? "live" : "sandbox") as "live" | "sandbox"; },
  get emailProvider() { return opt("EMAIL_PROVIDER", "postmark"); },
  get postmarkToken() { return opt("POSTMARK_SERVER_TOKEN"); },
  /** EMAIL_PROVIDER=gmail: send through a Gmail account with an app password (demo setup; no domain needed). */
  get gmailUser() { return opt("GMAIL_USER").trim(); },
  get gmailAppPassword() { return opt("GMAIL_APP_PASSWORD").replace(/\s+/g, ""); },
  /** Can real email go out with the configured provider? */
  get emailProviderReady() {
    return this.emailProvider === "gmail" ? Boolean(this.gmailUser && this.gmailAppPassword) : Boolean(this.postmarkToken);
  },
  /** Can replies-by-email reach Venn? Only with a Postmark inbound stream. Otherwise recipients use the Connect button. */
  get canReceiveReplies() { return Boolean(opt("POSTMARK_INBOUND_ADDRESS")) && this.emailProvider !== "gmail"; },
  get fromDomain() { return opt("EMAIL_FROM_DOMAIN", "venn.example.gatech.test"); },
  get replyDomain() { return opt("REPLY_DOMAIN", "reply.venn.example.gatech.test"); },
  get inboundSecret() { return opt("INBOUND_WEBHOOK_SECRET", "dev-inbound-secret"); },
  get linkSecret() {
    const v = opt("LINK_SIGNING_SECRET");
    if (!v && process.env.NODE_ENV === "production") throw new Error("LINK_SIGNING_SECRET must be set in production");
    return v || "dev-link-signing-secret-change-me";
  },
  /** Postmark inbound stream address (<hash>@inbound.postmarkapp.com). Replies route back as <hash>+<relayToken>@… */
  get postmarkInbound() { return opt("POSTMARK_INBOUND_ADDRESS"); },
  /** Real inbox that receives every email addressed to a FICTIONAL demo person (reserved test domains). Local .env only. */
  get demoInbox() { return opt("DEMO_INBOX_EMAIL").trim().toLowerCase(); },
  /** In EMAIL_MODE=sandbox, these addresses ALSO get the real email via Postmark. Everyone else: sandbox inbox only. */
  get sandboxAllowlist() { return opt("EMAIL_SANDBOX_ALLOWLIST").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean); },
  /** Show sign-in code emails in /dev/inbox (sandbox). On in development; off in production unless set. */
  get showSigninCodes() { return opt("SANDBOX_SHOW_SIGNIN_CODES", process.env.NODE_ENV === "production" ? "false" : "true") === "true"; },
  /** The "Continue with school login" demo picker (fictional identities, no verification). */
  get demoLogin() { return opt("ALLOW_DEMO_LOGIN", "true") === "true"; },
  get appUrl() { return opt("APP_URL", "http://localhost:3000"); },
  get appName() { return opt("APP_NAME", "Venn"); },
  get coBrandAA() { return opt("FEATURE_AA_COBRAND") === "true"; },
};
