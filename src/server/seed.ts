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
  brand: { primary: "#003057", accent: "#EAAA00" },
  // Sign-up domains (exact or subdomain). demo_domains = the reserved fictional seed-data domains.
  domains: ["gatech.edu"],
  demo_domains: ["example.gatech.test"],
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
  await db.unsafe(`drop table if exists event_rsvps, events, linkedin_links, referrals, invite_links, signin_codes, invite_optouts, invites, shared_contact, rate_limits, audit_log, sandbox_emails, relay_messages, intro_requests, goal_matches,
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

export const DEMO_STUDENT_ID = "d3e0a000-0000-4000-8000-000000000002"; // Alex Kim
export const DEMO_ALUM_ID = "d3e0a000-0000-4000-8000-000000000001"; // Morgan Ellis

/**
 * The demo pair's history, built through the real intro pipeline (draft → explicit send → relay reply).
 * - Alex → Morgan: sent, and Morgan replied through the relay (connected; Morgan's opted-in contact shows).
 * - Alex → two other alumni: sent, awaiting replies.
 * - Two other students → Morgan: sent, waiting in Morgan's sandbox inbox to answer.
 * - Morgan → one alum: sent (so Morgan's own Requests page isn't empty).
 * - Alex has one watched goal.
 * Sandbox only; idempotent (existing pairs are skipped).
 */
export async function seedDemoConversations(db = defaultSql) {
  if (env.emailMode !== "sandbox") return { intros: 0, replies: 0, goals: 0 };
  const { templateDraft } = await import("./agent/draft");
  const { sendIntro, processInbound } = await import("./intros");
  const { getOwnProfile, getPublicProfile } = await import("./profiles");
  const { relayAddress } = await import("./email/provider");
  const out = { intros: 0, replies: 0, goals: 0 };
  const demoIds = [DEMO_STUDENT_ID, DEMO_ALUM_ID];

  const userOf = async (id: string) => (await db`select user_id from profiles where id = ${id}`)[0]?.user_id as string | undefined;
  async function intro(from: string, to: string, goal: string, ask: string) {
    const [exists] = await db`select id, status, relay_token from intro_requests where sender_profile_id = ${from} and recipient_profile_id = ${to}`;
    if (exists) return exists;
    const uid = await userOf(from);
    const recipient = await getPublicProfile(to);
    if (!uid || !recipient) return null;
    const d = templateDraft(await getOwnProfile(from), recipient, ask, goal);
    const [row] = await db`insert into intro_requests (sender_profile_id, recipient_profile_id, subject, message, status, relay_token)
      values (${from}, ${to}, ${d.subject}, ${d.body}, 'draft', ${randomToken(32)}) returning id`;
    try {
      await sendIntro(from, uid, row.id, { subject: d.subject, body: d.body, userConfirmed: true });
    } catch (e) {
      await db`delete from intro_requests where id = ${row.id}`;
      console.warn(`  skipped intro ${from} → ${to}: ${(e as Error).message}`);
      return null;
    }
    out.intros++;
    return (await db`select id, status, relay_token from intro_requests where id = ${row.id}`)[0];
  }

  // Alex → Morgan, and Morgan replies through the relay.
  const am = await intro(DEMO_STUDENT_ID, DEMO_ALUM_ID, "GT alumni at Delta who could give advice on ops tech", "15-min advice call");
  if (am && am.status === "sent") {
    await processInbound({
      to: relayAddress(am.relay_token), providerMessageId: `demo-reply-${am.id}`,
      text: "Hi Alex! Always happy to help a fellow RoboJacket. I'm free Thursday after 4. Grab a time that works and bring a couple of projects you'd want feedback on.\n\nMorgan",
    });
    out.replies++;
  }

  // Alex → two other claimed alumni open to mentoring.
  const alumni = await db`select id from profiles where status = 'claimed' and 'alum' = any(roles) and not (id = any(${demoIds}))
    and summary_approved and 'mentoring students' = any(open_to) order by last_name limit 2`;
  for (const a of alumni) await intro(DEMO_STUDENT_ID, a.id, "Product designers in Atlanta open to mentoring", "15-min advice call");

  // Two other students → Morgan (pending in Morgan's inbox).
  const students = await db`select id from profiles where status = 'claimed' and 'student' = any(roles) and not ferpa_restricted
    and summary_approved and not (id = any(${demoIds})) order by last_name limit 2`;
  for (const s of students) await intro(s.id, DEMO_ALUM_ID, "Alumni at Delta who mentor students", "15-min advice call");

  // Morgan → one alum (Morgan's own sent request).
  const [peer] = await db`select id from profiles where status = 'claimed' and 'alum' = any(roles) and not (id = any(${demoIds}))
    and summary_approved and 'hiring' = any(open_to) order by last_name limit 1`;
  if (peer) await intro(DEMO_ALUM_ID, peer.id, "Engineering leaders hiring in Atlanta", "intro call about hiring");

  // One watched goal for Alex.
  const [g] = await db`select 1 from goals where owner_profile_id = ${DEMO_STUDENT_ID}`;
  if (!g) {
    const { runGoal } = await import("./agent/orchestrator");
    await runGoal("Product designers at Delta who mentor", DEMO_STUDENT_ID, () => {}, { standing: true });
    out.goals++;
  }
  return out;
}

/**
 * Demo events (Atlanta, next 30 days). Fixed ids: re-running refreshes the dates relative to today
 * (so the demo always has upcoming events) without duplicating anything. Everything is marked
 * is_demo except "Home for the Holidays", a real GT tradition that links to the Alumni Association.
 */
export async function seedDemoEvents(db = defaultSql) {
  const [school] = await db`select id from schools where slug = 'gatech'`;
  if (!school) return 0;
  const H = (name: string) => ({ Midtown: [33.7838, -84.383], Downtown: [33.755, -84.39], Buckhead: [33.8395, -84.3798], Westside: [33.781, -84.412],
    "Old Fourth Ward": [33.764, -84.372], "Inman Park": [33.759, -84.353], "Virginia-Highland": [33.781, -84.354] } as Record<string, number[]>)[name];
  const E = (n: number) => `e7e00000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const events = [
    { id: E(1), days: 3, at: "18:30", hours: 2, title: "Young Alumni Happy Hour", category: "social", hood: "Midtown", venue: "Midtown Commons (demo venue)", addr: "1000 Peachtree St NE, Atlanta, GA", going: 31,
      desc: "Drinks and snacks for Jackets who graduated in the last 10 years. Come straight from work, no RSVP fee." },
    { id: E(2), days: 5, at: "07:45", hours: 1.5, title: "Fintech Jackets Breakfast", category: "career", hood: "Buckhead", venue: "Buckhead Cafe Room (demo venue)", addr: "3400 Peachtree Rd NE, Atlanta, GA", going: 14,
      desc: "Coffee and a short panel with Jackets working in payments and fintech. Bring questions about breaking in." },
    { id: E(3), days: 8, at: "09:00", hours: 3, title: "Food Bank Volunteer Morning", category: "volunteer", hood: "Westside", venue: "Westside Food Bank (demo venue)", addr: "730 Joseph E Lowery Blvd NW, Atlanta, GA", going: 18,
      desc: "Sort and pack food with other Jackets. Closed-toe shoes, all ages 12+ welcome." },
    { id: E(4), days: 13, at: "19:30", hours: 3.5, title: "Rivalry Game Watch", category: "game_watch", hood: "Midtown", venue: "Tech Square Hall (demo venue)", addr: "85 5th St NW, Atlanta, GA", going: 112, featured: true,
      desc: "The biggest game of the year on the big screens. Wear gold. Food and drinks for purchase." },
    { id: E(5), days: 20, at: "19:00", hours: 3, title: "Board Game Night", category: "member_hosted", source: "member", hood: "Old Fourth Ward", venue: "Ponce City lounge (demo venue)", addr: "675 Ponce De Leon Ave NE, Atlanta, GA", going: 9,
      desc: "Bring a favorite game or learn a new one. Six tables, beginners welcome.", host: "morgan" },
    { id: E(6), days: 16, at: "10:00", hours: 3, title: "Family Day at the Park", category: "family", hood: "Virginia-Highland", venue: "Piedmont Park meadow (demo venue)", addr: "400 Park Dr NE, Atlanta, GA", going: 22,
      desc: "Picnic and lawn games for Jackets and their families. Kids' activities from 10 to noon." },
    { id: E(7), days: 27, at: "17:00", hours: 3, title: "Home for the Holidays", category: "social", hood: "Downtown", venue: "Downtown Atlanta (see Alumni Association page)", addr: "Downtown Atlanta, GA", going: 64, real: true,
      url: "https://www.gtalumni.org/events",
      desc: "A Georgia Tech Alumni Association tradition: Jackets home for the holidays get together. Date and venue here are placeholders; the Alumni Association page has the official details and registration." },
    { id: E(8), days: 10, at: "08:00", hours: 1.5, title: "Saturday Run on the BeltLine", category: "social", source: "member", hood: "Inman Park", venue: "Inman Park BeltLine entrance (demo venue)", addr: "Krog St & Irwin St NE, Atlanta, GA", going: 12,
      desc: "An easy 5K at conversation pace, then coffee. All speeds.", host: "alex" },
  ];
  const morgan = DEMO_ALUM_ID, alex = DEMO_STUDENT_ID;
  const hostName = async (pid: string) => { const [p] = await db`select first_name, last_name from profiles where id = ${pid}`; return p ? `${p.first_name} ${p.last_name}` : "A Jacket"; };
  for (const e of events) {
    const [lat, lng] = H(e.hood)!;
    const hostId = e.host === "morgan" ? morgan : e.host === "alex" ? alex : null;
    const hostLabel = hostId ? await hostName(hostId) : "Atlanta Network";
    await db`
      insert into events (id, school_id, title, description, category, source, host_label, host_profile_id, starts_at, ends_at, city, neighborhood,
        venue_name, venue_address, lat, lng, external_url, is_featured, is_demo)
      values (${e.id}, ${school.id}, ${e.title}, ${e.desc}, ${e.category}, ${e.source ?? "network"}, ${hostLabel}, ${hostId},
        ((date_trunc('day', now() at time zone 'America/New_York') + make_interval(days => ${e.days}) + ${e.at}::time) at time zone 'America/New_York'),
        ((date_trunc('day', now() at time zone 'America/New_York') + make_interval(days => ${e.days}) + ${e.at}::time + make_interval(mins => ${Math.round(e.hours * 60)})) at time zone 'America/New_York'),
        'Atlanta', ${e.hood}, ${e.venue}, ${e.addr}, ${lat}, ${lng}, ${e.url ?? null}, ${Boolean(e.featured)}, ${!e.real})
      on conflict (id) do update set starts_at = excluded.starts_at, ends_at = excluded.ends_at, title = excluded.title, description = excluded.description,
        host_label = excluded.host_label, external_url = excluded.external_url, is_featured = excluded.is_featured`;
    const [{ n }] = await db`select count(*)::int n from event_rsvps where event_id = ${e.id}`;
    if (n > 0) continue;
    // Claimed members first (they can show as faces), then other visible Atlanta-area people to reach the count.
    const people = await db`
      select p.id from profiles p
      where p.status <> 'removed' and not p.ferpa_restricted and (p.status = 'unclaimed' or p.summary_approved)
        and p.id not in (${alex}, ${morgan})
        and (p.status = 'claimed' or lower(coalesce(p.city, '')) = 'atlanta')
      order by (p.status = 'claimed') desc, md5(p.id::text || ${e.id}) limit ${e.going}`;
    if (people.length) await db`insert into event_rsvps ${db(people.map((p) => ({ event_id: e.id, profile_id: p.id })), "event_id", "profile_id")} on conflict do nothing`;
    if (hostId) await db`insert into event_rsvps (event_id, profile_id) values (${e.id}, ${hostId}) on conflict do nothing`;
  }
  // Alex is going to the happy hour ("Going 1" in the demo); Morgan to the game watch.
  await db`insert into event_rsvps (event_id, profile_id) values (${E(1)}, ${alex}), (${E(4)}, ${morgan}) on conflict do nothing`;
  return events.length;
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
  await seedDemoConversations(db);
  await seedDemoEvents(db);
  return { members, intros, aa, demo };
}
