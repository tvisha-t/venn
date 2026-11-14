import "dotenv/config";
import { sql } from "../src/server/db";

// Demo reviewer: approve (or reject) the pending transcript/diploma request for a personal email.
// Usage: npm run verify:approve -- person@gmail.com [--reject]
// Approving/rejecting deletes the uploaded file automatically (database trigger). After approval the
// person signs in on /signin with that email; their account is created at that first sign-in.
async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  const reject = process.argv.includes("--reject");
  if (!email) {
    const pending = await sql`select personal_email, method, created_at from verifications where status = 'pending' and personal_email is not null order by created_at`;
    console.log(pending.length ? "Pending requests:\n" + pending.map((p) => `  ${p.personal_email}  (${p.method}, ${new Date(p.created_at).toLocaleString()})`).join("\n") : "No pending requests.");
    console.log("\nUsage: npm run verify:approve -- <email> [--reject]");
    return;
  }
  const r = await sql`update verifications set status = ${reject ? "rejected" : "approved"} where lower(personal_email) = ${email} and status = 'pending' returning id, method`;
  if (!r.length) { console.log(`No pending request for ${email}.`); return; }
  const [{ files }] = await sql`select count(*)::int files from verification_files where verification_id = ${r[0].id}`;
  console.log(`✓ ${reject ? "Rejected" : "Approved"} ${r[0].method} for ${email}. File deleted: ${files === 0}.${reject ? "" : " They can now sign in at /signin with this email."}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => sql.end());
