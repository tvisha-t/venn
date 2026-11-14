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
  get fromDomain() { return opt("EMAIL_FROM_DOMAIN", "venn.example.gatech.test"); },
  get replyDomain() { return opt("REPLY_DOMAIN", "reply.venn.example.gatech.test"); },
  get inboundSecret() { return opt("INBOUND_WEBHOOK_SECRET", "dev-inbound-secret"); },
  get linkSecret() {
    const v = opt("LINK_SIGNING_SECRET");
    if (!v && process.env.NODE_ENV === "production") throw new Error("LINK_SIGNING_SECRET must be set in production");
    return v || "dev-link-signing-secret-change-me";
  },
  get appUrl() { return opt("APP_URL", "http://localhost:3000"); },
  get appName() { return opt("APP_NAME", "Venn"); },
  get coBrandAA() { return opt("FEATURE_AA_COBRAND") === "true"; },
};
