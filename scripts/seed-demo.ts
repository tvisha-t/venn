import "dotenv/config";
import { sql } from "../src/server/db";
import { migrate, seedDemoIntros, seedDemoPeople, seedSchool } from "../src/server/seed";

// Loads only mock-data/demo_people.json (fictional / consented demo profiles) and their demo intros.
// Fast and idempotent; no Alumni Association re-import.
async function main() {
  await migrate();
  const schoolId = await seedSchool();
  const people = await seedDemoPeople(schoolId);
  const intros = await seedDemoIntros();
  console.log(`✓ demo people: ${people.map((p) => `${p.first_name} ${p.last_name}`).join(", ") || "none"} | new demo intros: ${intros}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => sql.end());
