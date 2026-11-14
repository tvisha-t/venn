import "dotenv/config";
import { sql } from "../src/server/db";
import { repairSearchable } from "../src/server/profiles";

// One-off backfill: every published member gets a search entry and a map location (unlisted
// cities are placed at their state's main metro). Safe to re-run; it only touches what's missing.
async function main() {
  const rows = await sql`select id, first_name from profiles where status = 'claimed' and summary_approved
    and (embedding is null or (lat is null and (city is not null or state is not null)))`;
  let fixed = 0;
  for (const r of rows) if (await repairSearchable(r.id)) fixed++;
  const still = await sql`select first_name, last_name, city, state from profiles where status = 'claimed' and summary_approved and lat is null`;
  console.log(`✓ repaired ${fixed} of ${rows.length} published profiles; without a map location now: ${still.length}${still.length ? " (" + still.map((s) => `${s.first_name} ${s.last_name}: ${s.city ?? "?"}, ${s.state ?? "?"}`).join("; ") + ")" : ""}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => sql.end());
