import { execSync } from "node:child_process";

// Fresh, seeded database for every E2E run — through the real seed + AA import pipeline.
export default function globalSetup() {
  execSync("npx tsx scripts/seed.ts --reset", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://postgres:venn@localhost:54329/venn", ANTHROPIC_API_KEY: "", VOYAGE_API_KEY: "" },
  });
}
