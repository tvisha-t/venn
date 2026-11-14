// Alumni Association import (BUILD_SPEC.md §6). This is the ONLY path that
// creates unclaimed profiles — the seed script uses it too.
import Papa from "papaparse";
import { sql as defaultSql } from "../db";
import { emailHash } from "../crypto";
import { geocode } from "../geo";
import { embedMany, profileEmbedText, toPgVector } from "../embed";
import { audit } from "../audit";

export type AaRow = {
  constituent_id: string; first_name: string; last_name: string; preferred_name: string;
  degree: string; major: string; college: string; class_year: string;
  gt_programs: string; cs_threads: string; activities: string;
  employer: string; job_title: string; industry: string; city: string; state: string; country: string;
  email_on_file: string; emfl_alias: string; do_not_contact: string; directory_opt_out: string; deceased: string;
  last_updated: string;
};

export type ImportCounts = {
  rows: number;
  imported: number;           // unclaimed profiles created or updated
  created: number;
  updated: number;
  excluded_deceased: number;
  excluded_opt_out: number;
  excluded_not_alum: number;  // class_year in the future (would be a current student)
  suppressed: number;         // suppression list or previously removed
  deduped: number;            // extra records folded into another record
  merged_with_claimed: number;
  do_not_contact: number;
  purged_previously_imported: number; // excluded now but imported before → deleted
};

const yes = (s: string | undefined) => (s ?? "").trim().toUpperCase() === "Y";
const list = (s: string | undefined) => (s ?? "").split(";").map((x) => x.trim()).filter(Boolean);
const clean = (s: string | undefined) => { const t = (s ?? "").trim(); return t === "" ? null : t; };

export function parseAaCsv(text: string): AaRow[] {
  const res = Papa.parse<AaRow>(text.trim(), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
  if (res.errors.length) throw new Error(`CSV parse error on row ${res.errors[0].row}: ${res.errors[0].message}`);
  const required = ["constituent_id", "first_name", "last_name", "class_year", "deceased", "directory_opt_out"];
  const missing = required.filter((c) => !res.meta.fields?.includes(c));
  if (missing.length) throw new Error(`CSV is missing columns: ${missing.join(", ")}`);
  return res.data.filter((r) => r.constituent_id?.trim());
}

const personKey = (r: AaRow) => `${r.first_name.trim().toLowerCase()}|${r.last_name.trim().toLowerCase()}|${r.class_year.trim()}`;

/** Rule 4: fold duplicate people (same first+last+class_year) into the most recently
 *  updated record, filling its empty fields from the others. Restrictive flags
 *  (deceased / opt-out / do-not-contact) win if ANY record has them. */
export function dedupeRows(rows: AaRow[]): { rows: AaRow[]; deduped: number; foldedIds: Map<string, string[]> } {
  const groups = new Map<string, AaRow[]>();
  for (const r of rows) {
    const k = personKey(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const out: AaRow[] = [];
  const foldedIds = new Map<string, string[]>();
  let deduped = 0;
  for (const g of groups.values()) {
    if (g.length === 1) { out.push(g[0]); continue; }
    g.sort((a, b) => (b.last_updated ?? "").localeCompare(a.last_updated ?? ""));
    const merged: AaRow = { ...g[0] };
    for (const other of g.slice(1)) {
      for (const k of Object.keys(merged) as (keyof AaRow)[]) {
        if (!clean(merged[k]) && clean(other[k])) merged[k] = other[k];
      }
      for (const f of ["deceased", "directory_opt_out", "do_not_contact"] as const) {
        if (yes(other[f])) merged[f] = "Y";
      }
    }
    foldedIds.set(merged.constituent_id, g.slice(1).map((x) => x.constituent_id));
    deduped += g.length - 1;
    out.push(merged);
  }
  return { rows: out, deduped, foldedIds };
}

type Opts = { schoolSlug?: string; actor?: string; now?: Date; db?: typeof defaultSql };

export async function importAlumniAssociation(csvText: string, opts: Opts = {}): Promise<ImportCounts> {
  const db = opts.db ?? defaultSql;
  const actor = opts.actor ?? "system:aa-import";
  const currentYear = (opts.now ?? new Date()).getFullYear();
  const raw = parseAaCsv(csvText);

  const counts: ImportCounts = {
    rows: raw.length, imported: 0, created: 0, updated: 0, excluded_deceased: 0, excluded_opt_out: 0,
    excluded_not_alum: 0, suppressed: 0, deduped: 0, merged_with_claimed: 0, do_not_contact: 0,
    purged_previously_imported: 0,
  };

  const { rows, deduped, foldedIds } = dedupeRows(raw);
  counts.deduped = deduped;

  const toEmbed: { id: string; text: string }[] = [];

  await db.begin(async (tx) => {
    const [school] = await tx`select id from schools where slug = ${opts.schoolSlug ?? "gatech"}`;
    if (!school) throw new Error("School not found — run migrations + seed school first");
    const schoolId: string = school.id;

    const supp = await tx`select email_hash, aa_constituent_id from suppression_list where school_id = ${schoolId}`;
    const suppHashes = new Set(supp.map((s) => s.email_hash).filter(Boolean));
    const suppIds = new Set(supp.map((s) => s.aa_constituent_id).filter(Boolean));

    // Claimed members to merge with (rule 5). Email hashes computed in SQL so the
    // raw address never leaves the database layer.
    const claimed = await tx`
      select p.id, p.aa_constituent_id, lower(p.first_name) fn, lower(p.last_name) ln, p.class_year, lower(coalesce(p.major,'')) major,
             encode(digest(lower(trim(cp.email_primary)), 'sha256'), 'hex') eh,
             encode(digest(lower(trim(u.login_email)), 'sha256'), 'hex') leh
      from profiles p left join contact_points cp on cp.profile_id = p.id left join users u on u.id = p.user_id
      where p.school_id = ${schoolId} and p.status = 'claimed'`;
    const byAa = new Map(claimed.filter((c) => c.aa_constituent_id).map((c) => [c.aa_constituent_id, c]));
    const byEmail = new Map<string, (typeof claimed)[number]>();
    for (const c of claimed) { if (c.eh) byEmail.set(c.eh, c); if (c.leh) byEmail.set(c.leh, c); }
    const byName = new Map(claimed.map((c) => [`${c.fn}|${c.ln}|${c.class_year}|${c.major}`, c]));

    const existing = await tx`select id, aa_constituent_id, status from profiles where school_id = ${schoolId} and aa_constituent_id is not null`;
    const existingByAa = new Map(existing.map((e) => [e.aa_constituent_id as string, e]));

    const purge = async (aaIds: string[]) => {
      for (const id of aaIds) {
        const e = existingByAa.get(id);
        if (e && e.status === "unclaimed") {
          await tx`delete from goal_matches where profile_id = ${e.id}`;
          const n = await tx`select 1 from intro_requests where recipient_profile_id = ${e.id} limit 1`;
          if (n.length) await tx`update profiles set status = 'removed', embedding = null where id = ${e.id}`;
          else await tx`delete from profiles where id = ${e.id}`;
          await tx`delete from contact_points where profile_id = ${e.id}`;
          counts.purged_previously_imported++;
        }
      }
    };

    for (const r of rows) {
      const ids = [r.constituent_id, ...(foldedIds.get(r.constituent_id) ?? [])];

      // Rule 1 — never store deceased / directory opt-out
      if (yes(r.deceased)) { counts.excluded_deceased++; await purge(ids); continue; }
      if (yes(r.directory_opt_out)) { counts.excluded_opt_out++; await purge(ids); continue; }

      // Rule 6 — alumni only
      const classYear = Number(r.class_year);
      if (!Number.isFinite(classYear) || classYear > currentYear) { counts.excluded_not_alum++; await purge(ids); continue; }

      // Rule 2 — suppression list (by AA id or hashed email)
      const hashes = [emailHash(r.email_on_file), emailHash(r.emfl_alias)].filter(Boolean) as string[];
      if (ids.some((i) => suppIds.has(i)) || hashes.some((h) => suppHashes.has(h))) { counts.suppressed++; continue; }
      // Previously removed via "Remove me" → never re-create
      if (ids.some((i) => existingByAa.get(i)?.status === "removed")) { counts.suppressed++; continue; }

      // Rule 5 — merge with a claimed member; claimed data wins
      const nameKey = `${r.first_name.trim().toLowerCase()}|${r.last_name.trim().toLowerCase()}|${classYear}|${r.major.trim().toLowerCase()}`;
      const match = ids.map((i) => byAa.get(i)).find(Boolean) ?? hashes.map((h) => byEmail.get(h)).find(Boolean) ?? byName.get(nameKey);
      if (match) {
        counts.merged_with_claimed++;
        // If an unclaimed copy was imported before the person claimed, fold it in.
        for (const i of ids) {
          const e = existingByAa.get(i);
          if (e && e.status === "unclaimed" && e.id !== match.id) {
            await tx`update intro_requests set recipient_profile_id = ${match.id} where recipient_profile_id = ${e.id}`;
            await tx`delete from goal_matches where profile_id = ${e.id}`;
            await tx`delete from profiles where id = ${e.id}`;
          }
        }
        if (!match.aa_constituent_id) {
          await tx`update profiles set aa_constituent_id = ${r.constituent_id} where id = ${match.id}`;
          match.aa_constituent_id = r.constituent_id;
        }
        // Fill only empty contact fields (claimed data wins); honor DNC.
        await tx`
          insert into contact_points (profile_id, email_emfl_alias, do_not_contact)
          values (${match.id}, ${clean(r.emfl_alias)}, ${yes(r.do_not_contact)})
          on conflict (profile_id) do update set
            email_emfl_alias = coalesce(contact_points.email_emfl_alias, excluded.email_emfl_alias),
            do_not_contact = contact_points.do_not_contact or excluded.do_not_contact,
            updated_at = now()`;
        continue;
      }

      // Rules 7–9 — minimal public fields; contact only into contact_points
      const pub = {
        first_name: clean(r.preferred_name) ?? r.first_name.trim(),
        last_name: r.last_name.trim(),
        class_year: classYear,
        degree: clean(r.degree),
        major: clean(r.major),
        gt_programs: list(r.gt_programs),
        employer: clean(r.employer),
        job_title: clean(r.job_title),
        industry: clean(r.industry),
        city: clean(r.city),
        state: clean(r.state),
        country: clean(r.country),
      };
      const { lat, lng } = geocode(pub.city, pub.state, r.constituent_id);
      const dnc = yes(r.do_not_contact);
      if (dnc) counts.do_not_contact++;

      // Rule 12 — idempotent upsert by constituent_id (also catches records folded by dedupe)
      const prior = ids.map((i) => existingByAa.get(i)).find(Boolean);
      let profileId: string;
      if (prior) {
        await tx`
          update profiles set aa_constituent_id = ${r.constituent_id}, first_name = ${pub.first_name}, last_name = ${pub.last_name},
            class_year = ${pub.class_year}, degree = ${pub.degree}, major = ${pub.major}, gt_programs = ${pub.gt_programs},
            employer = ${pub.employer}, job_title = ${pub.job_title}, industry = ${pub.industry},
            city = ${pub.city}, state = ${pub.state}, country = ${pub.country}, lat = ${lat}, lng = ${lng},
            aa_last_updated = ${clean(r.last_updated)}, updated_at = now()
          where id = ${prior.id}`;
        profileId = prior.id;
        // drop other records of the same person that an older import created
        for (const i of ids) {
          const e = existingByAa.get(i);
          if (e && e.id !== prior.id && e.status === "unclaimed") {
            await tx`update intro_requests set recipient_profile_id = ${prior.id} where recipient_profile_id = ${e.id}`;
            await tx`delete from profiles where id = ${e.id}`;
          }
        }
        counts.updated++;
      } else {
        const [ins] = await tx`
          insert into profiles (school_id, status, source, aa_constituent_id, first_name, last_name, roles, class_year, degree, major,
            gt_programs, employer, job_title, industry, city, state, country, lat, lng, aa_last_updated)
          values (${schoolId}, 'unclaimed', 'alumni_association', ${r.constituent_id}, ${pub.first_name}, ${pub.last_name}, ${["alum"]},
            ${pub.class_year}, ${pub.degree}, ${pub.major}, ${pub.gt_programs}, ${pub.employer}, ${pub.job_title}, ${pub.industry},
            ${pub.city}, ${pub.state}, ${pub.country}, ${lat}, ${lng}, ${clean(r.last_updated)})
          returning id`;
        profileId = ins.id;
        counts.created++;
      }
      counts.imported++;

      await tx`
        insert into contact_points (profile_id, email_primary, email_emfl_alias, do_not_contact)
        values (${profileId}, ${clean(r.email_on_file)}, ${clean(r.emfl_alias)}, ${dnc})
        on conflict (profile_id) do update set email_primary = excluded.email_primary,
          email_emfl_alias = excluded.email_emfl_alias, do_not_contact = excluded.do_not_contact, updated_at = now()`;

      toEmbed.push({ id: profileId, text: profileEmbedText({ ...pub, roles: ["alum"] }) });
    }

    // Rule 11 — one audit row per run (counts only, no personal data)
    await audit(actor, "aa.import", null, counts, tx);
  });

  // Rule 10 — embeddings (outside the transaction; may call a remote API)
  const vecs = await embedMany(toEmbed.map((t) => t.text), "document");
  for (let i = 0; i < toEmbed.length; i += 200) {
    const batch = toEmbed.slice(i, i + 200).map((t, j) => ({ id: t.id, v: toPgVector(vecs[i + j]) }));
    await db`
      update profiles p set embedding = b.v::vector
      from (select * from jsonb_to_recordset(${db.json(batch as never)}) as x(id uuid, v text)) b
      where p.id = b.id`;
  }

  return counts;
}
