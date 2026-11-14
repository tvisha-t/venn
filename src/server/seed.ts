// Seed helpers shared by scripts/seed.ts and the test suite.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { sql as defaultSql } from "./db";
import { randomToken } from "./crypto";
import { embedMany, profileEmbedText, toPgVector } from "./embed";
import { importAlumniAssociation, type ImportCounts } from "./import/aa";
import { geocode } from "./geo";
import { env } from "./env";

const ROOT = process.cwd();
const MOCK = path.join(ROOT, "mock-data");

export const GT_CONFIG = {
  brand: { primary: "#7A3E6A", accent: "#C0699B" },
  mapCenter: { lat: 33.7756, lng: -84.3963, zoom: 10 },
  programs: ["CREATE-X", "VIP", "Co-op", "Internship Program", "Grand Challenges", "Honors Program", "Study Abroad", "OMSCS", "Professional Education", "Startup Launch"],
  csThreads: ["Intelligence", "Systems & Architecture", "Theory", "Modeling & Simulation", "Devices", "Information Internetworks", "Media", "People"],
};

export async function migrate(db = defaultSql) {
  const dir = path.join(ROOT, "db", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await db.unsafe(readFileSync(path.join(dir, f), "utf8"));
  }
}

export async function resetDatabase(db = defaultSql) {
  await db.unsafe(`drop table if exists shared_contact, rate_limits, audit_log, sandbox_emails, relay_messages, intro_requests, goal_matches,
    goal_parse_cache, goals, suppression_list, contact_points, profiles, users, schools cascade`);
}

export async function seedSchool(db = defaultSql) {
  const [s] = await db`
    insert into schools (slug, name, config) values ('gatech', 'Georgia Tech', ${db.json(GT_CONFIG)})
    on conflict (slug) do update set config = excluded.config returning id`;
  return s.id as string;
}

type Member = {
  id: string; aa_constituent_id: string | null; login_email: string; first_name: string; last_name: string; roles: string[];
  class_year: number | null; degree: string | null; major: string | null; gt_programs: string[]; cs_threads: string[];
  activities: string[]; industry: string | null; employer: string | null; job_title: string | null; city: string | null;
  state: string | null; country: string | null; lat: number | null; lng: number | null; summary: string | null;
  summary_approved: boolean; open_to: string[]; interests: string[]; contact_channel: string; status: string; ferpa_restricted: boolean;
};

export function loadMembers(): Member[] {
  return JSON.parse(readFileSync(path.join(MOCK, "claimed_members.json"), "utf8"));
}

/** Claimed members = people who signed in themselves. Loaded before the AA import so merge rules apply. */
export async function seedClaimedMembers(schoolId: string, db = defaultSql) {
  const members = loadMembers().map((m) => ({
    ...m,
    industry: m.industry || null, employer: m.employer || null, job_title: m.job_title || null,
    major: m.major || null, degree: m.degree || null, city: m.city || null, state: m.state || null,
  }));
  for (const m of members) {
    const [u] = await db`
      insert into users (auth_subject, login_email) values (${`mock|${m.id}`}, ${m.login_email})
      on conflict (auth_subject) do update set login_email = excluded.login_email returning id`;
    await db`
      insert into profiles (id, school_id, user_id, status, source, aa_constituent_id, first_name, last_name, roles, class_year,
        degree, major, gt_programs, cs_threads, activities, industry, employer, job_title, city, state, country, lat, lng,
        summary, summary_approved, open_to, interests, contact_channel, ferpa_restricted)
      values (${m.id}, ${schoolId}, ${u.id}, 'claimed', 'self', ${m.aa_constituent_id}, ${m.first_name}, ${m.last_name}, ${m.roles},
        ${m.class_year}, ${m.degree}, ${m.major}, ${m.gt_programs}, ${m.cs_threads}, ${m.activities}, ${m.industry}, ${m.employer},
        ${m.job_title}, ${m.city}, ${m.state}, ${m.country}, ${m.lat == null ? null : Math.round(m.lat * 100) / 100},
        ${m.lng == null ? null : Math.round(m.lng * 100) / 100}, ${m.summary}, ${m.summary_approved}, ${m.open_to}, ${m.interests},
        ${m.contact_channel ?? "email"}, ${m.ferpa_restricted})
      on conflict (id) do update set user_id = excluded.user_id, status = 'claimed', summary = excluded.summary,
        summary_approved = excluded.summary_approved, ferpa_restricted = excluded.ferpa_restricted, updated_at = now()`;
    await db`
      insert into contact_points (profile_id, email_primary) values (${m.id}, ${m.login_email})
      on conflict (profile_id) do update set email_primary = excluded.email_primary`;
  }
  const vecs = await embedMany(members.map((m) => profileEmbedText(m)), "document");
  for (let i = 0; i < members.length; i++) {
    await db`update profiles set embedding = ${toPgVector(vecs[i])}::vector where id = ${members[i].id}`;
  }
  return members.length;
}

type SeedIntro = {
  id: string; sender_id: string; recipient_profile_id: string; goal_text: string; message: string;
  status: string; sent_at: string; reminder_sent: boolean;
};

const REPLY_SAMPLES = [
  "Happy to help! I have time Thursday afternoon — does 3pm work for a quick call?",
  "Thanks for reaching out. Yes, let's do 15 minutes next week. Send over a couple of times.",
];

export async function seedIntros(db = defaultSql) {
  const intros: SeedIntro[] = JSON.parse(readFileSync(path.join(MOCK, "intro_requests.json"), "utf8"));
  let i = 0;
  for (const it of intros) {
    const replied = it.status === "replied";
    const sentAt = new Date(it.sent_at);
    await db`
      insert into intro_requests (id, sender_profile_id, recipient_profile_id, subject, message, status, relay_token, sent_at,
        reminder_sent_at, replied_at, reply_preview, sender_seen_reply)
      values (${it.id}, ${it.sender_id}, ${it.recipient_profile_id}, ${it.goal_text}, ${it.message}, ${it.status}, ${randomToken()},
        ${sentAt}, ${it.reminder_sent ? new Date(sentAt.getTime() + 5 * 86400_000) : null},
        ${replied ? new Date(sentAt.getTime() + 86400_000) : null}, ${replied ? REPLY_SAMPLES[i++ % 2] : null}, ${!replied})
      on conflict (id) do nothing`;
  }
  return intros.length;
}

// ---------------------------------------------------------------- demo people (fictional or consented)
type DemoPerson = Omit<Member, "lat" | "lng" | "summary_approved" | "status" | "ferpa_restricted" | "contact_channel" | "aa_constituent_id"> & {
  consent: string;
  demo_label: string;
  shared_contact?: { preferred_email: string | null; phone: string | null; linkedin_url: string | null; website_url: string | null };
  seed_intro?: { from: "first_demo_student"; goal: string; ask: string };
};

export function loadDemoPeople(): DemoPerson[] {
  const raw = JSON.parse(readFileSync(path.join(MOCK, "demo_people.json"), "utf8")) as { people: DemoPerson[] };
  return raw.people.filter((p) => p.consent && p.consent.trim() !== "");
}

/** Claimed demo profiles (e.g. an alum who receives intros). Idempotent. */
export async function seedDemoPeople(schoolId: string, db = defaultSql) {
  const people = loadDemoPeople();
  for (const m of people) {
    const [u] = await db`
      insert into users (auth_subject, login_email) values (${`mock|${m.id}`}, ${m.login_email})
      on conflict (auth_subject) do update set login_email = excluded.login_email returning id`;
    const { lat, lng } = geocode(m.city, m.state, m.id);
    await db`
      insert into profiles (id, school_id, user_id, status, source, first_name, last_name, roles, class_year, degree, major,
        gt_programs, cs_threads, activities, industry, employer, job_title, city, state, country, lat, lng, summary, summary_approved,
        open_to, interests)
      values (${m.id}, ${schoolId}, ${u.id}, 'claimed', 'self', ${m.first_name}, ${m.last_name}, ${m.roles}, ${m.class_year}, ${m.degree},
        ${m.major}, ${m.gt_programs}, ${m.cs_threads}, ${m.activities}, ${m.industry}, ${m.employer}, ${m.job_title}, ${m.city}, ${m.state},
        ${m.country}, ${lat}, ${lng}, ${m.summary}, true, ${m.open_to}, ${m.interests})
      on conflict (id) do update set user_id = excluded.user_id, status = 'claimed', employer = excluded.employer, job_title = excluded.job_title,
        summary = excluded.summary, summary_approved = true, open_to = excluded.open_to, interests = excluded.interests, updated_at = now()`;
    await db`insert into contact_points (profile_id, email_primary) values (${m.id}, ${m.login_email})
      on conflict (profile_id) do update set email_primary = excluded.email_primary`;
    if (m.shared_contact) {
      const c = m.shared_contact;
      await db`insert into shared_contact (profile_id, preferred_email, phone, linkedin_url, website_url)
        values (${m.id}, ${c.preferred_email}, ${c.phone}, ${c.linkedin_url}, ${c.website_url})
        on conflict (profile_id) do update set preferred_email = excluded.preferred_email, phone = excluded.phone,
          linkedin_url = excluded.linkedin_url, website_url = excluded.website_url, updated_at = now()`;
    }
    const [v] = await embedMany([profileEmbedText(m)], "document");
    await db`update profiles set embedding = ${toPgVector(v)}::vector where id = ${m.id}`;
  }
  return people;
}

/** A sent intro to each demo recipient, so /dev/inbox has a message to reply to. Sandbox only. */
export async function seedDemoIntros(db = defaultSql) {
  if (env.emailMode !== "sandbox") return 0;
  const { templateDraft } = await import("./agent/draft");
  const { sendIntro } = await import("./intros");
  const { getOwnProfile, getPublicProfile } = await import("./profiles");
  let n = 0;
  for (const m of loadDemoPeople()) {
    if (!m.seed_intro) continue;
    const [s] = await db`select p.id, p.user_id from profiles p where p.status = 'claimed' and 'student' = any(p.roles)
      and not p.ferpa_restricted and p.summary_approved order by p.last_name limit 1`;
    if (!s) continue;
    const [exists] = await db`select 1 from intro_requests where sender_profile_id = ${s.id} and recipient_profile_id = ${m.id}`;
    if (exists) continue;
    const sender = await getOwnProfile(s.id);
    const recipient = (await getPublicProfile(m.id))!;
    const d = templateDraft(sender, recipient, m.seed_intro.ask, m.seed_intro.goal);
    const [row] = await db`insert into intro_requests (sender_profile_id, recipient_profile_id, subject, message, status, relay_token)
      values (${s.id}, ${m.id}, ${d.subject}, ${d.body}, 'draft', ${randomToken(32)}) returning id`;
    await sendIntro(s.id, s.user_id, row.id, { subject: d.subject, body: d.body, userConfirmed: true });
    n++;
  }
  return n;
}

export async function seedAll(db = defaultSql): Promise<{ members: number; intros: number; aa: ImportCounts; demo: number }> {
  await migrate(db);
  const schoolId = await seedSchool(db);
  const members = await seedClaimedMembers(schoolId, db);
  const csv = readFileSync(path.join(MOCK, "alumni_association_export.csv"), "utf8");
  const aa = await importAlumniAssociation(csv, { db, actor: "system:seed" });
  const intros = await seedIntros(db);
  const demo = (await seedDemoPeople(schoolId, db)).length;
  await seedDemoIntros(db);
  return { members, intros, aa, demo };
}
