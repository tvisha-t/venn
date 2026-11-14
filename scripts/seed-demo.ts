import "dotenv/config";
import { sql } from "../src/server/db";
import { migrate, seedDemoConversations, seedDemoEvents, seedDemoIntros, seedGroupsAndQuiz, seedDemoPeople, seedSchool } from "../src/server/seed";

// Loads only mock-data/demo_people.json (fictional / consented demo profiles) and their demo intros.
// Fast and idempotent; no Alumni Association re-import.
async function main() {
  await migrate();
  const schoolId = await seedSchool();
  const people = await seedDemoPeople(schoolId);
  const intros = await seedDemoIntros();
  const convo = await seedDemoConversations();
  const events = await seedDemoEvents();
  const gq = await seedGroupsAndQuiz();
  console.log(`✓ demo people: ${people.map((p) => `${p.first_name} ${p.last_name}`).join(", ") || "none"} | new demo intros: ${intros + convo.intros} | replies: ${convo.replies} | goals: ${convo.goals} | events: ${events} | groups: ${gq.groups} | quiz questions: ${gq.questions}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => sql.end());
