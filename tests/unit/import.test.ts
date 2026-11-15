import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/server/db";
import { importAlumniAssociation, dedupeRows, parseAaCsv } from "@/server/import/aa";
import { resetDatabase, seedAll } from "@/server/seed";
import { emailHash } from "@/server/crypto";

const CSV = readFileSync("mock-data/alumni_association_export.csv", "utf8");
const rows = parseAaCsv(CSV);
const HEADER = CSV.split("\n")[0];

beforeAll(async () => {
  await resetDatabase();
  await seedAll();
});

describe("GT records import (§6)", () => {
  it("imports the expected number of unclaimed profiles on the mock file", async () => {
    const [{ n }] = await sql`select count(*)::int n from profiles where status = 'unclaimed'`;
    const deceasedOrOptOut = rows.filter((r) => r.deceased === "Y" || r.directory_opt_out === "Y").length;
    expect(deceasedOrOptOut).toBe(27);
    expect(n).toBe(606 - 27 - 6 - 18);
  });

  it("never stores deceased or directory opt-out rows (rule 1)", async () => {
    const excluded = rows.filter((r) => r.deceased === "Y" || r.directory_opt_out === "Y").map((r) => r.constituent_id);
    const found = await sql`select 1 from profiles where aa_constituent_id = any(${excluded})`;
    expect(found.length).toBe(0);
  });

  it("creates do-not-contact profiles but flags the contact point (rule 3)", async () => {
    const dnc = rows.filter((r) => r.do_not_contact === "Y" && r.deceased === "N" && r.directory_opt_out === "N").map((r) => r.constituent_id);
    const res = await sql`select cp.do_not_contact from profiles p join contact_points cp on cp.profile_id = p.id
      where p.aa_constituent_id = any(${dnc}) and p.status = 'unclaimed'`;
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((r) => r.do_not_contact)).toBe(true);
  });

  it("dedupes duplicate people, keeping the most recent record (rule 4)", async () => {
    const { rows: out, deduped } = dedupeRows(rows);
    expect(deduped).toBe(6);
    expect(out.length).toBe(600);
    const dupes = await sql`select first_name, last_name, class_year, count(*)::int n from profiles
      where status <> 'removed' group by 1,2,3 having count(*) > 1`;
    expect(dupes).toEqual([]);
    // the 2019 duplicates had blank employers; the merged record keeps the newer, filled data
    const folded = rows.filter((r) => r.constituent_id.startsWith("AA9")).map((r) => r.constituent_id);
    const stale = await sql`select 1 from profiles where aa_constituent_id = any(${folded})`;
    expect(stale.length).toBe(0);
  });

  it("merges with claimed members instead of creating duplicates; claimed data wins (rule 5)", async () => {
    const merged = await sql`select p.id, p.status, p.source from profiles p where p.aa_constituent_id is not null and p.status = 'claimed'`;
    expect(merged.length).toBe(18);
    expect(merged.every((m) => m.source === "self")).toBe(true);
  });

  it("never imports future class years as alumni (rule 6)", async () => {
    const csv = `${HEADER}\nAA777001,Future,Student,,BS,Computer Science,College of Computing,2031,,,,,,,Atlanta,GA,US,fs@example.com,,N,N,N,2025-01-01`;
    const c = await importAlumniAssociation(csv);
    expect(c.excluded_not_alum).toBe(1);
    expect((await sql`select 1 from profiles where aa_constituent_id = 'AA777001'`).length).toBe(0);
  });

  it("keeps contact data out of the profiles table and rounds locations (rules 7, 8)", async () => {
    const cols = await sql`select column_name from information_schema.columns where table_name = 'profiles'`;
    expect(cols.map((c) => c.column_name).some((c) => /email|phone/.test(c))).toBe(false);
    const bad = await sql`select 1 from profiles where lat is not null and (lat * 100 <> round(lat * 100) or lng * 100 <> round(lng * 100))`;
    expect(bad.length).toBe(0);
  });

  it("is idempotent — re-running never duplicates (rule 12)", async () => {
    const before = await sql`select count(*)::int n from profiles`;
    const c = await importAlumniAssociation(CSV);
    const after = await sql`select count(*)::int n from profiles`;
    expect(after[0].n).toBe(before[0].n);
    expect(c.created).toBe(0);
    expect(c.updated).toBe(555);
  });

  it("writes one audit row per run with counts", async () => {
    const a = await sql`select meta from audit_log where action = 'aa.import' order by id desc limit 1`;
    expect(a[0].meta).toMatchObject({ imported: 555, excluded_deceased: 7, excluded_opt_out: 20, deduped: 6, merged_with_claimed: 18 });
  });

  it("never re-creates suppressed or removed people (rule 2)", async () => {
    const target = rows.find((r) => r.email_on_file && r.deceased === "N" && r.directory_opt_out === "N" && !r.constituent_id.startsWith("AA9"))!;
    const [school] = await sql`select id from schools where slug = 'gatech'`;
    const [p] = await sql`select id from profiles where aa_constituent_id = ${target.constituent_id}`;
    // simulate "Remove me"
    await sql`update profiles set status = 'removed' where id = ${p.id}`;
    await sql`delete from contact_points where profile_id = ${p.id}`;
    await sql`insert into suppression_list (school_id, email_hash, aa_constituent_id) values (${school.id}, ${emailHash(target.email_on_file)}, ${target.constituent_id})`;
    const c = await importAlumniAssociation(CSV);
    expect(c.suppressed).toBeGreaterThanOrEqual(1);
    const live = await sql`select 1 from profiles where aa_constituent_id = ${target.constituent_id} and status <> 'removed'`;
    expect(live.length).toBe(0);
    // also suppressed by email hash alone, under a new constituent id
    const csv2 = `${HEADER}\nAA555555,${target.first_name},${target.last_name},,BS,X,Y,2001,,,,,,,Atlanta,GA,US,${target.email_on_file.toUpperCase()},,N,N,N,2026-01-01`;
    const c2 = await importAlumniAssociation(csv2);
    expect(c2.suppressed).toBe(1);
    expect((await sql`select 1 from profiles where aa_constituent_id = 'AA555555'`).length).toBe(0);
  });

  it("purges a previously imported person who later opts out", async () => {
    const t = rows.find((r) => r.deceased === "N" && r.directory_opt_out === "N" && r.email_on_file && !r.constituent_id.startsWith("AA9") && r.constituent_id !== "AA100533")!;
    const exists = await sql`select 1 from profiles where aa_constituent_id = ${t.constituent_id} and status = 'unclaimed'`;
    if (!exists.length) return;
    const line = CSV.split("\n").find((l) => l.startsWith(`${t.constituent_id},`))!.trim();
    const optedOut = line.replace(/,N,N,N,([^,]*)$/, ",N,Y,N,$1");
    const c = await importAlumniAssociation(`${HEADER}\n${optedOut}`);
    expect(c.excluded_opt_out).toBe(1);
    expect(c.purged_previously_imported).toBe(1);
    expect((await sql`select 1 from profiles where aa_constituent_id = ${t.constituent_id} and status <> 'removed'`).length).toBe(0);
  });

  it("generates embeddings for every imported profile (rule 10)", async () => {
    const [{ n }] = await sql`select count(*)::int n from profiles where status <> 'removed' and embedding is null`;
    expect(n).toBe(0);
  });
});
