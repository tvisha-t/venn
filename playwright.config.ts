import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const DB = process.env.TEST_DATABASE_URL ?? "postgres://postgres:venn@localhost:54329/venn";

// E2E runs the production build against the disposable local DB, sandbox email, and no
// Anthropic key, so the agent's rule-based fallback path is exercised deterministically.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/signin`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: DB, EMAIL_MODE: "sandbox", RATE_LIMIT_MULTIPLIER: "50", ANTHROPIC_API_KEY: "", VOYAGE_API_KEY: "",
      SANDBOX_SHOW_SIGNIN_CODES: "true", DEMO_INBOX_EMAIL: "", EMAIL_SANDBOX_ALLOWLIST: "", POSTMARK_SERVER_TOKEN: "", GMAIL_APP_PASSWORD: "",
      LINK_SIGNING_SECRET: "e2e-link-secret", INBOUND_WEBHOOK_SECRET: "e2e-inbound-secret", APP_URL: `http://localhost:${PORT}`,
    },
  },
});
