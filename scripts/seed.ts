import "dotenv/config";
import { sql } from "../src/server/db";
import { resetDatabase, seedAll } from "../src/server/seed";
import { embedderName } from "../src/server/embed";

async function main() {
  if (process.argv.includes("--reset")) {
    await resetDatabase();
    console.log("✓ database reset");
  }
  const t = Date.now();
  const r = await seedAll();
  console.log(`✓ seeded ${r.members} claimed members, ${r.demo} demo people, ${r.intros} intro requests (embedder: ${embedderName()})\n`);
  console.log("GT records import summary");
  console.table(r.aa);
  const expected = r.aa.rows - r.aa.excluded_deceased - r.aa.excluded_opt_out - r.aa.excluded_not_alum - r.aa.deduped - r.aa.merged_with_claimed - r.aa.suppressed;
  console.log(`rows ${r.aa.rows} − excluded ${r.aa.excluded_deceased + r.aa.excluded_opt_out + r.aa.excluded_not_alum} − duplicates ${r.aa.deduped} − merged ${r.aa.merged_with_claimed} − suppressed ${r.aa.suppressed} = ${expected} (imported ${r.aa.imported})`);
  console.log(`done in ${((Date.now() - t) / 1000).toFixed(1)}s`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => sql.end());
