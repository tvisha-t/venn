import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    fileParallelism: false, // tests share one database
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      // Tests run against a disposable local DB, never your Supabase project.
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://postgres:venn@localhost:54329/venn",
      LINK_SIGNING_SECRET: "test-link-secret",
      INBOUND_WEBHOOK_SECRET: "test-inbound-secret",
      EMAIL_MODE: "sandbox",
      // Never send real mail from tests, whatever is in .env.
      POSTMARK_SERVER_TOKEN: "", GMAIL_APP_PASSWORD: "", DEMO_INBOX_EMAIL: "", EMAIL_SANDBOX_ALLOWLIST: "", POSTMARK_INBOUND_ADDRESS: "", SANDBOX_SHOW_SIGNIN_CODES: "true",
      ANTHROPIC_API_KEY: "",
      VOYAGE_API_KEY: "",
    },
  },
});
