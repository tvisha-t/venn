# Venn @ Georgia Tech — MVP Build Spec

> **How to use this file:** Give it to your coding agent (Claude Code, Cursor, etc.) as the source of truth for the first build. Mock data lives in `mock-data/` and can be regenerated with `python3 scripts/generate_mock_data.py`.
>
> **Hackathon context:** GT SGA x College of Lifetime Learning Campus Solutions Challenge, Engineering track. Submissions due **Sun Nov 15, 9:00 AM ET**. Judges are GT OIT, Cyber Security and College of Lifetime Learning leaders, so privacy, GT policy fit and a working end-to-end build matter more than feature count.

---

## 1. Product in one paragraph

Venn turns Georgia Tech's network into an agent that works for you. A user types a goal ("GT alumni at Delta", "a technical cofounder who did CREATE-X", "I want to mentor students in climate tech"). The user's agent parses the goal, searches GT people, ranks matches, and drafts an intro the user approves. The recipient gets **one email** (no app, no account): replying connects them and shares their email; "Not interested" shares nothing. Venn tracks every intro automatically through an email relay.

**Who it's for:** current students, alumni, faculty and staff, and lifetime learners (professional education and online master's students).

---

## 2. MVP scope

### In scope (must work end to end)

| # | Feature | Notes |
|---|---|---|
| 1 | GT sign-in (mocked GT Login) | Adapter interface + mock implementation. Role selection. |
| 2 | Profile creation | Paste or upload LinkedIn PDF / resume, AI extracts a profile, user approves. |
| 3 | Alumni Association import | Import `alumni_association_export.csv` into **unclaimed** profiles, respecting all flags. |
| 4 | Goal box + agent | Parse goal, search, rank with reasons, draft intro. Steps stream to the UI live. |
| 5 | Explore views | List, Map (clustered), Companies, plus filters (industry, class year, major, GT program, location). |
| 6 | Profiles | Claimed vs Unclaimed badges. Never shows contact info. |
| 7 | Email intros + relay | Send via email provider, Reply-To relay address, inbound webhook, status tracking. |
| 8 | Requests tab | Sent / Replied / Not interested / No response, plus one reminder after 5 days. |
| 9 | Opt-out + claim | Signed one-tap links in every email to unclaimed people: Claim or Remove me. |
| 10 | Standing goals | Saved goals re-run when new profiles arrive and notify the user of new matches. |
| 11 | Audit log | Every read of contact data and every send is logged. |

### Out of scope for MVP (mention as roadmap only)

- Real GT Login (CAS/SSO) integration (needs OIT approval), so we **mock** it behind an adapter.
- GT Connect / PeopleGrove data sync.
- Intros through mutual connections.
- Companies posting hiring goals / any monetization.
- SMS delivery (keep the `contact_channel` field, but email only in MVP).
- Vouch-based verification.

---

## 3. Tech stack (recommended)

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js 15 (App Router) + TypeScript** | One repo for UI + API routes; team knows React/TS. |
| UI | **Tailwind CSS + shadcn/ui** | Fast, clean, easy to theme with GT tokens. |
| DB | **PostgreSQL (Supabase)** + **pgvector** | Relational data + semantic search + Row Level Security. |
| ORM | Drizzle or Prisma | Typed queries, migrations. |
| AI | Claude API (structured JSON outputs) | Goal parsing, reranking, drafting, profile extraction. |
| Email | Postmark (or Resend/SendGrid) **with inbound webhooks** | Outbound intros + inbound relay parsing. |
| Map | MapLibre GL / Mapbox GL + supercluster | Clustered pins, neighborhood-level zoom. |
| Jobs | Supabase cron or Vercel Cron | Reminders, standing-goal re-runs. |
| Hosting | Vercel + Supabase | Zero-ops for the hackathon. |
| Tests | Vitest (unit) + Playwright (e2e) | Includes privacy-leak tests. |

---

## 4. Architecture

```mermaid
flowchart LR
  U[User browser] -->|GT Login (mock adapter)| APP[Next.js app]
  APP --> API[API routes]
  API --> AG[Agent orchestrator]
  AG -->|parse / rerank / draft| LLM[Claude API]
  AG -->|filters + vector search| DB[(Postgres + pgvector)]
  API --> DB
  IMP[AA CSV importer] --> DB
  API -->|send intro| EM[Email provider]
  EM -->|recipient email| R[Recipient inbox]
  R -->|reply| RELAY[relay+token@reply.domain]
  RELAY -->|inbound webhook| API
  R -->|Not interested / Claim / Remove links| API
  CRON[Cron jobs] --> API
```

**Hard rule:** contact data (emails) lives in a **separate table** (`contact_points`) that only the email-sending service role can read. The LLM, the search API and the UI **never** receive contact fields.

---

## 5. Data model (Postgres)

```sql
-- Multi-school ready from day one (GT is school #1)
create table schools (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,              -- 'gatech'
  name text not null,                     -- 'Georgia Tech'
  config jsonb not null default '{}'      -- program list, threads, brand colors, default map center
);

create table users (                      -- people who signed in
  id uuid primary key default gen_random_uuid(),
  auth_subject text unique not null,      -- from GT Login adapter (mock: 'mock|<id>')
  login_email text not null,              -- PRIVATE
  created_at timestamptz default now()
);

create table profiles (                   -- claimed AND unclaimed people
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id) not null,
  user_id uuid references users(id),      -- null = unclaimed
  status text not null check (status in ('claimed','unclaimed','removed')),
  source text not null check (source in ('self','alumni_association')),
  aa_constituent_id text,                 -- link to AA record (unique per school when present)
  first_name text not null,
  last_name text not null,
  roles text[] not null,                  -- {'student','alum','faculty','staff','lifetime_learner'}
  class_year int,
  degree text,
  major text,
  gt_programs text[] default '{}',        -- CREATE-X, VIP, Co-op, ...
  cs_threads text[] default '{}',
  activities text[] default '{}',
  industry text,
  employer text,
  job_title text,
  city text, state text, country text,
  lat numeric(6,2), lng numeric(6,2),     -- ROUNDED to 2 decimals (~1 km) = neighborhood level
  summary text,                           -- AI-written; claimed profiles need summary_approved = true
  summary_approved boolean default false,
  open_to text[] default '{}',            -- mentoring students, hiring, investing, being hired, ...
  interests text[] default '{}',
  embedding vector(1024),                 -- for semantic search
  updated_at timestamptz default now()
);
create unique index on profiles (school_id, aa_constituent_id) where aa_constituent_id is not null;

create table contact_points (             -- PRIVATE, service-role only
  profile_id uuid primary key references profiles(id) on delete cascade,
  email_primary text,                     -- claimed: login/contact email; unclaimed: AA email_on_file
  email_emfl_alias text,                  -- GT Email Forwarding for Life alias if known
  do_not_contact boolean default false,
  updated_at timestamptz default now()
);

create table suppression_list (           -- opt-outs, so removed people are never re-created
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id),
  email_hash text,                        -- sha256(lowercased email)
  aa_constituent_id text,
  created_at timestamptz default now()
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid references profiles(id) not null,
  raw_text text not null,
  parsed jsonb not null,                  -- output of parse_goal (see §7)
  standing boolean default false,         -- re-run when new profiles arrive
  created_at timestamptz default now()
);

create table goal_matches (
  goal_id uuid references goals(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  score numeric,
  reason text,                            -- one line: "Leads payments PM at Stripe · open to mentoring"
  notified boolean default false,
  primary key (goal_id, profile_id)
);

create table intro_requests (
  id uuid primary key default gen_random_uuid(),
  sender_profile_id uuid references profiles(id) not null,
  recipient_profile_id uuid references profiles(id) not null,
  goal_id uuid references goals(id),
  message text not null,                  -- final approved text
  status text not null check (status in ('draft','sent','replied','not_interested','no_response','bounced','suppressed')),
  relay_token text unique not null,       -- random 32+ bytes, used in reply address + signed links
  sent_at timestamptz,
  reminder_sent_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz default now()
);

create table relay_messages (              -- inbound/outbound relay log
  id uuid primary key default gen_random_uuid(),
  intro_id uuid references intro_requests(id),
  direction text check (direction in ('outbound','inbound')),
  provider_message_id text unique,        -- idempotency for webhooks
  received_at timestamptz default now()
);

create table audit_log (
  id bigserial primary key,
  actor text not null,                    -- user id or 'system:<job>'
  action text not null,                   -- 'contact.read', 'intro.send', 'profile.remove', 'aa.import'
  target_id uuid,
  meta jsonb,
  at timestamptz default now()
);
```

**Row Level Security (Supabase):**
- `profiles`: any signed-in user can read rows where `status <> 'removed'`; only the owner can update their claimed profile.
- `contact_points`, `suppression_list`, `audit_log`: **no** client access, service role only.
- `goals`, `intro_requests`: owner-only read/write.

---

## 6. Alumni Association import (the "school-provided data" path)

Input: `mock-data/alumni_association_export.csv` (606 rows, fictional). Columns:

```
constituent_id, first_name, last_name, preferred_name, degree, major, college, class_year,
gt_programs (;-separated), cs_threads (;-separated), activities (;-separated),
employer, job_title, industry, city, state, country,
email_on_file, emfl_alias, do_not_contact (Y/N), directory_opt_out (Y/N), deceased (Y/N), last_updated
```

**Import rules (implement exactly, with tests):**
1. **Exclude** rows where `deceased = Y` or `directory_opt_out = Y`. Do not store them at all.
2. **Exclude** rows matching `suppression_list` (by `aa_constituent_id` or `sha256(email_on_file)`).
3. `do_not_contact = Y`: create the profile (searchable) but set `contact_points.do_not_contact = true`. The UI shows **Request intro** as disabled ("Not accepting intros").
4. **Dedupe:** the export contains duplicate people (same first + last + class_year, different `constituent_id`). Keep the record with the most recent `last_updated`, merging non-empty fields.
5. **Merge with claimed users:** if a claimed member has the same `aa_constituent_id`, or the same email hash, or the same first + last + class_year + major, link to the AA record and **do not** create an unclaimed duplicate. Claimed data always wins.
6. **Never** create unclaimed profiles for current students (the AA file shouldn't contain them; enforce `class_year <= current year` and role = alum).
7. **Minimal public fields** on unclaimed profiles: name, class year, degree, major, GT programs, employer, job title, industry, city. Contact fields go **only** to `contact_points`.
8. **Geocode** city to a centroid (`mock-data/cities.json`), jitter by up to about 3 km, then round to 2 decimals. Never store street-level location.
9. Missing employer/title is fine: show "Role not listed".
10. Generate embeddings for every imported profile.
11. Write one `audit_log` row per import run with counts: `imported`, `excluded_deceased`, `excluded_opt_out`, `suppressed`, `deduped`, `merged_with_claimed`.
12. The import is **idempotent**: re-running it updates by `constituent_id` and never duplicates.

**Expected result on the default mock file:** 606 rows minus the excluded deceased/opt-out rows, minus the duplicates, minus the rows merged with claimed members. Print a summary table after import.

---

## 7. The agent

The agent is an orchestrator that runs **tools** in order and streams each step to the UI over Server-Sent Events, so the user sees: *Understanding your goal → Searching 1,240 Yellow Jackets → Ranking 12 matches → Ready.*

### 7.1 Tools

| Tool | Input | Output | Implementation |
|---|---|---|---|
| `parse_goal` | raw text + sender profile | `ParsedGoal` JSON | LLM, structured output |
| `search_profiles` | `ParsedGoal` | up to 200 candidates (no contact data) | SQL filters + pgvector similarity |
| `rank_matches` | goal + candidates (trimmed fields) | top N with `score` + one-line `reason` | LLM rerank; fallback = vector score |
| `draft_intro` | sender profile + recipient profile + goal | `{subject, body}` ≤ 120 words | LLM |
| `rewrite_intro` | draft + `"shorter"` or `"warmer"` | `{subject, body}` | LLM |
| `send_intro` | approved draft + recipient id | intro_request row | **Requires explicit user click.** The agent can never send by itself. |
| `suggest_next_best` | intro id | next candidate from the same goal | Re-uses `goal_matches` |

### 7.2 `ParsedGoal` schema

```json
{
  "intent": "find_people | mentor | get_advice | hire | get_hired | cofounder | invest | meet_locally | other",
  "filters": {
    "employers": ["Delta Air Lines"],
    "industries": ["Aerospace"],
    "cities": ["Atlanta"],
    "roles": ["alum"],
    "class_year_min": null,
    "class_year_max": null,
    "majors": [],
    "gt_programs": ["CREATE-X"],
    "open_to": ["mentoring students"]
  },
  "semantic_query": "engineers working in airline operations technology",
  "ask_type": "15-min advice call",
  "explanation": "Looking for GT alumni at Delta who could share advice on ops tech roles."
}
```

### 7.3 Prompt rules (put these in the system prompts)

- Use **only** the profile fields provided. Never invent employers, titles or facts.
- Drafts: under 120 words, one specific ask, a small time commitment, and a sender intro line ("I'm a 3rd-year CS student at Georgia Tech"). No flattery, no guilt.
- Never include email addresses, phone numbers or links in drafts (the system adds the reply instructions).
- The reason line is ≤ 12 words, factual, and about the goal fit ("Product lead at Stripe · open to mentoring").
- If the goal is unclear, return `intent: "other"` plus a clarifying question for the UI to show.

### 7.4 Robustness

- **LLM failure or timeout** → fall back to rule-based search (SQL filters from simple keyword matching + vector similarity) and a template draft. The flow never dead-ends.
- **Zero results** → loosen filters in this order (city → class years → programs) and tell the user what was relaxed.
- **Prompt injection:** profile text is wrapped as data. The rank and draft prompts treat profile fields as untrusted content.
- **Cost guard:** cache `parse_goal` results by normalized text, and send only trimmed fields (no summaries over 300 chars) to rerank.

### 7.5 Standing goals

When "Keep this goal active" is on, a cron job (every hour, and after every AA import or new claim) re-runs `search_profiles` + `rank_matches` for standing goals, inserts new `goal_matches`, and shows a "3 new matches" badge.

---

## 8. Email intros and the relay

### 8.1 Send

1. User approves the draft and clicks **Send**.
2. Server checks: recipient `status <> 'removed'`, not `do_not_contact`, not in `suppression_list`, and no open intro from the same sender to the same recipient already exists.
3. Pick the address: claimed → `email_primary`; unclaimed → `email_emfl_alias` if present, else `email_on_file`. No address → status `suppressed`, and the UI offers "Copy message + open LinkedIn search".
4. Send through the provider with:
   - `From: "{{SenderFirstName}} via Venn" <intros@{{domain}}>`
   - `Reply-To: reply+{relay_token}@reply.{{domain}}`
   - Body: the message, a one-line sender context ("CS '28 · Georgia Tech"), then the action area:
     - **Reply to connect.** Replying shares your email with {{SenderFirstName}}.
     - **Not interested** → `GET /r/{token}/decline` (signed)
     - Unclaimed only: **Claim your profile** → `/r/{token}/claim`, and **Remove me from Venn** → `/r/{token}/remove`
   - For unclaimed alumni, optional co-brand line: "Sent via the GT Alumni Association" (feature flag, off by default).
5. Log `intro.send` and `contact.read` in `audit_log`.

### 8.2 Inbound relay

- Provider posts the inbound email to `POST /api/email/inbound` (verify the provider signature).
- Parse the `relay_token` from the To address, look up the intro, and **dedupe by `provider_message_id`** (webhooks can retry).
- First reply → status `replied`, then forward the reply to the sender with the recipient's real address in `Reply-To` (this is the consented email share), and notify the sender in-app.
- Strip quoted history and signatures when showing a preview in the app.
- Bounces and complaints from provider webhooks → status `bounced` + flag the contact point.

### 8.3 State machine

```
draft ──send──▶ sent ──reply──▶ replied
                 │ └──decline link──▶ not_interested ──▶ suggest_next_best
                 └──5 days, no reply──▶ (one reminder) ──5 more days──▶ no_response
Late reply after no_response ──▶ replied
```

### 8.4 Signed links

- `/r/{token}/decline|claim|remove`: token = 32 random bytes plus an HMAC. Single action, idempotent, expires after 60 days.
- **Remove** → set profile `status = 'removed'`, delete `contact_points`, add hashes to `suppression_list`, confirm with a plain page: "You've been removed from Venn. We won't list or contact you again."
- **Claim** → GT Login (mock), then a prefilled profile from the AA record, then the approve screen.

---

## 9. Auth and identity

```ts
interface IdentityProvider {
  signIn(): Promise<{ subject: string; email: string; displayName: string; affiliation: 'student'|'faculty'|'staff'|'alum' }>;
}
// MockGtLogin: a "Sign in with GT" button opens a picker of seeded demo identities.
// Future GtCasLogin: CAS/SAML against GT Login, pending OIT approval.
```

- After first sign-in: choose roles (multiple allowed), class year and major.
- Profile builder: upload a LinkedIn "Save to PDF" export or a resume, the LLM extracts fields, the user edits and approves. Nothing goes public until approved.
- **Graduation switch:** when `class_year` has passed for a student, show "Did you graduate?" and one tap switches the role to alum.
- **Check-ins:** a monthly banner, "Still at {{employer}}?", with Yes or Update.

---

## 10. Explore views

| Sort | View | Details |
|---|---|---|
| Location / near me | **Map** | Opens on Atlanta (33.7756, -84.3963). Clusters with supercluster; tap a cluster to open a side list. **Hide clusters with fewer than 3 people at zoom levels above city level** (k-anonymity), so no single person is pinpointed. |
| Company | **Company cards** | `"Delta Air Lines · 37 Yellow Jackets"`. Click to see people grouped by job title. |
| Industry | **Industry filter** | Industry dropdown lists industries sorted by count (UI revision 2026-11-14 replaced the separate grouped-list tab). |
| Class year / major / program | **Filtered list** | Facet chips with counts. |

- Filters combine and are reflected in the URL (`?industry=Fintech&city=San%20Francisco&program=CREATE-X`).
- Goal results have the same List / Map / Companies switcher.
- APIs return aggregates for map and company views, never raw contact data.

---

## 11. API surface

```
POST   /api/auth/mock-signin
GET    /api/me                         PATCH /api/me
POST   /api/profile/import-resume      (PDF/text → extracted fields, not saved until approve)
POST   /api/profile/approve

POST   /api/goals                      (SSE stream of agent steps → matches)
GET    /api/goals/:id/matches
PATCH  /api/goals/:id                  ({ standing: true })

GET    /api/profiles/:id               (public fields only)
GET    /api/explore/list?filters
GET    /api/explore/map?bbox&zoom&filters   (clusters)
GET    /api/explore/companies?filters

POST   /api/intros/draft               ({recipientId, goalId})
POST   /api/intros/rewrite             ({introId, mode: 'shorter'|'warmer'})
POST   /api/intros/:id/send
GET    /api/intros                     (Requests tab)

POST   /api/email/inbound              (provider webhook, signature-verified)
POST   /api/email/events               (bounces/complaints)
GET    /r/:token/decline | /claim | /remove

POST   /api/admin/import-aa            (service role; CSV upload)
GET    /api/admin/dashboard            (aggregates only: intros sent/replied, by industry/city)
```

**Every response is serialized through a `PublicProfile` DTO** that structurally cannot contain `login_email`, `email_primary` or `email_emfl_alias`. Add a test that fails if any API JSON contains `@`.

---

## 12. UI spec

> **Revised 2026-11-14:** sleek, modern product UI in the style of Handshake / Linear. Visual and layout changes only. Every flow, privacy rule and the email-only intro model are unchanged.
>
> **Rebrand 2026-11-14 (later):** the whole app moves from GT navy/gold to the **Venn plum** palette from the login mockup (`Venn — Login.pdf`). Venn has its own brand; it still never uses official GT logos.

### 12.1 Design tokens

```css
:root {
  --bg: #F8F4F7;              /* page background (soft blush gray) */
  --surface: #FFFFFF;         /* cards, panels, sidebar */
  --line: #ECE3E9;            /* hairline borders, dividers */
  --text: #17131A;            /* primary text */
  --text-2: #625A66;          /* secondary/meta text (AA on white and on --bg) */
  --text-3: #9C93A0;          /* icons, placeholders ONLY: fails AA for small text */
  --brand: #7A3E6A;           /* Venn plum: primary buttons, key text, selected rows, map clusters */
  --brand-hover: #693359;
  --brand-tint: #F4E6EF;      /* selected row, active filter pill */
  --petal: #C0699B;           /* small accent: focus ring, active nav marker, selected map cluster ring */
  --petal-text: #8A3B6C;      /* accent used as text ("Why", "New") — AA on white */
  --petal-tint: #F3DFEA;      /* chips, badges, highlight behind headline words */
  --panel: #F1E2EB;           /* marketing / info panels (login "How it works", privacy note) */
  --success: #1F7A4D;         /* on --success-bg #E8F5EE */
}
```

- **Type:** **Plus Jakarta Sans** (rounded geometric sans) for everything, weights 400 / 500 / 600 / 700; headlines 700 with tight tracking. A monospace (JetBrains Mono) only for small numerals/labels such as "12 min" and "01". Sizes: 28 page title · 20 section · 16 card title · 14 body · 13 meta (login headline 44).
- **Wordmark:** lowercase **venn** in plum.
- **Shape:** 10 px cards, 8 px inputs and buttons, pill chips, 24 px marketing panels. Few borders. Shadows only on hover (and the floating preview card on login).
- **Do not** use official GT logos (Interlocking GT, Buzz).
- **Accessibility:** WCAG AA contrast, visible focus ring (petal), full keyboard support, respect `prefers-reduced-motion`, split views stack under 900 px. At most 2 chips per list row (extras collapse to "+N").
- **Components:** shadcn/ui throughout; skeleton loaders for lists.

### 12.2 Layout

- **App shell:** slim left sidebar (Home, Explore, Requests, Saved goals; lucide icons; gold indicator on the active item) and a top bar with an **"Ask Venn…"** input (⌘K / Ctrl+K focuses it; Enter runs the goal) and an avatar menu (Profile, Sandbox inbox, Admin, Sign out). On phones the sidebar becomes a bottom tab bar.
- **Split view (Results and Explore):** Handshake-style. A compact list on the left and the selected profile on the right. Under 900 px the panes stack.
- **Filters:** one row of pill dropdowns (Role, Industry, Program, City, Class year, Major) with counts, plus a search field. The Industry dropdown is sorted by count (replaces the separate Industries tab).
- **View switch:** a segmented control for **List · Map · Companies**.

### 12.3 Screens

1. **Sign in** (per `Venn — Login.pdf`): left card with the venn wordmark, "Find your **people**." (highlighted word), school-email field + **Continue**, "or", **Continue with school login** (GT Login; mock picker in demo), "Graduated? Use your alumni or lifetime forwarding email.", a privacy note ("Your email and phone are never shown. They're shared only when you reply to an intro."), and Terms / Privacy links. Right panel "How it works": a sample match card ("You both: …" overlap, Open-to tags, Request intro) and three steps (01 Type a goal · 02 See what you share · 03 They reply to connect). On phones the sample card sits above the headline and the privacy note pins to the bottom.
2. **Profile builder:** upload LinkedIn PDF or resume → extracted fields in an editable form → AI summary → **Approve**. Optional opt-in contact sharing.
3. **Home:** one large goal input, 4 suggestion chips (2 per row), then **Active goals** and **Recent replies** lists.
4. **Agent progress:** a one-line status bar ("Searching 614 Yellow Jackets…" with step count) that collapses, when done, into **"Venn understood: [chips]"** (employer, industry, city, role, program, ask).
5. **Results:** split view. A **result row** shows avatar, name, "Title · Company", "Class of '15 · Atlanta", one **Why** line, and an **Unclaimed** badge only when relevant. **Request intro** lives in the detail pane.
6. **Profile detail pane:** fields, GT programs and Open to as pills, opt-in contact details (if shared), **Request intro**. No relay contact info.
7. **Intro composer (side panel):** clean editor, **Shorter** / **Warmer** ghost buttons, live email preview, **Send intro** bottom-right.
8. **Requests:** a table (Person · Message · Status · Updated) with subtle tinted status badges, reply preview, and next-best suggestion.
9. **Map:** light basemap, navy count clusters, gold ring on the selected cluster, side list of the selected cluster. Falls back to a list when WebGL is unavailable.
10. **Companies:** company list with counts; selecting one shows its people grouped by title.
11. **Saved goals:** list of goals with Active toggle state and new-match counts.
12. **Recipient email template:** thin plum rule, message, sender context, actions (see §8.1).
13. **Removed / Declined / Claim landing pages:** plain, reassuring, one sentence each.
14. **Admin (demo only):** AA import upload + import summary table + engagement dashboard (aggregates only).

Every screen needs **loading, empty and error states** (e.g., empty results: "No exact matches. We loosened the city filter. Here are 8 Yellow Jackets in Georgia.").

---

## 13. Privacy and security requirements (judges will check these)

| Requirement | Implementation |
|---|---|
| FERPA (students) | Students appear **only** after they sign up and approve. Only directory-type fields plus what they add. Honor a `ferpa_restricted` flag (seeded field) by hiding the profile entirely. |
| GT data classification | Treat all profile and contact data as **Protected**: TLS everywhere, encryption at rest (Supabase default + pgcrypto for `contact_points`), least-privilege roles. |
| Contact data never exposed | Separate table, service-role only, DTO serialization, automated leak test. |
| Opt-out | One-tap remove, suppression list (hashes), never re-imported. |
| Audit | `audit_log` for contact reads, sends, imports, removals. |
| Location privacy | Coordinates rounded to ~1 km; k-anonymity on map clusters. |
| Abuse resistance | Verified sign-in only; one open intro per sender→recipient; one reminder max; per-minute burst throttle on API routes (bot protection only, **not** a user quota). |
| Secrets | `.env` only, never committed; provider webhook signatures verified. |
| AI safety | No contact data in prompts; profile text treated as untrusted; agent cannot send without a user click. |
| Security review readiness | Document controls in `SECURITY.md` mapped to HECVAT Lite sections (access control, encryption, logging, incident response, data retention). |

**Data retention:** declined/no-response intros keep metadata 1 year; message bodies are deleted after 180 days; removed profiles keep only suppression hashes.

---

## 14. Seed and mock data

| File | Contents |
|---|---|
| `mock-data/alumni_association_export.csv` | 606 fictional AA records. Includes **deceased**, **directory opt-out**, **do-not-contact**, missing employers, missing emails and 6 duplicate people, to test the import rules. |
| `mock-data/claimed_members.json` | 60 signed-up members: 26 alumni (18 of them overlap AA records, to test merging), 24 students, faculty/staff and lifetime learners. Includes approved summaries, `open_to`, interests, rounded coordinates, and one student with `ferpa_restricted: true` (must never appear). |
| `mock-data/intro_requests.json` | 6 intros across every status for the Requests tab. |
| `mock-data/cities.json` | City centroids for geocoding. |
| `scripts/generate_mock_data.py` | Deterministic generator (`--alumni`, `--members`, `--seed`). |

All emails use reserved domains (`example.com`, `*.example.gatech.test`). **No real people.** For the live demo, add real teammates and friends who consent, with clearly labeled demo data.

**Sample AA row:**
```
AA100565,Priya,Hall,Priya,MS,Computer Science,College of Computing,2020,,Modeling & Simulation;Intelligence,,Gulfstream,Design Engineer,Aerospace,Atlanta,GA,US,priya.hall52@example.com,priya.hall52@alumni.example.gatech.test,N,N,N,2022-12-27
```

**Seed command:** `npm run db:seed` → runs migrations, inserts the `gatech` school config, imports the AA CSV through the **real** import pipeline (not a shortcut), loads claimed members, generates embeddings and loads intro requests.

**Demo mode:** set `EMAIL_MODE=sandbox` so intros to mock addresses go to a local inbox viewer (`/dev/inbox`) where you can click Reply / Not interested to simulate the recipient. Real addresses (consenting teammates) go through the provider.

---

## 15. Testing (robustness checklist)

**Unit**
- Import: excludes deceased/opt-out, respects do-not-contact, dedupes, merges with claimed, is idempotent, applies suppression.
- `parse_goal` fallback when the LLM errors.
- State machine transitions, including a late reply after `no_response`.
- Signed link verification, expiry and idempotency.
- Coordinate rounding and k-anonymity clustering.

**Privacy**
- Crawl every API route with seeded data and assert no response contains `@` or phone-number patterns.
- Assert LLM request payloads contain no contact fields (log + inspect in tests).

**E2E (Playwright)**
1. Student signs in → builds profile from a resume → approves.
2. Types "GT alumni at Delta who could give advice on ops tech" → sees streamed steps → gets ranked results with reasons.
3. Switches to Map, then Companies → filters by CREATE-X.
4. Requests an intro → clicks Shorter → sends.
5. In `/dev/inbox`, recipient replies → status becomes **Replied** and the sender gets the reply.
6. Another recipient clicks **Not interested** → status updates → next-best is suggested.
7. An unclaimed recipient clicks **Remove me** → profile disappears from search; re-running the AA import does not bring it back.
8. A standing goal gets a new match after a new member claims a profile.

**Resilience:** webhook retries (dedupe), email provider down (queue + retry with backoff), LLM rate limit (fallback), empty states.

---

## 16. Build order (fits the Sunday 9 AM deadline)

| Block | Deliverable |
|---|---|
| 1 | Repo, Next.js + Tailwind + shadcn, GT tokens, Supabase project, schema + RLS migrations |
| 2 | Mock GT sign-in, profile model, AA importer + seed script (with import tests) |
| 3 | Explore: List + filters, then Companies, then Map |
| 4 | Agent: parse → search → rank with SSE streaming + fallback |
| 5 | Intro draft/rewrite/send, email templates, sandbox inbox, inbound relay + statuses |
| 6 | Requests tab, reminders cron, decline/claim/remove links, standing goals |
| 7 | Profile builder from resume/LinkedIn PDF, graduation switch |
| 8 | Privacy tests, audit log, admin import summary + dashboard, `SECURITY.md` |
| 9 | Polish: empty/error states, accessibility pass, record the 3-minute video, write submission answers |

If time runs short, cut in this order: standing goals → admin dashboard → profile builder (seed profiles instead) → reminders. **Never cut:** the end-to-end intro flow, the privacy guarantees, the AA import rules.

---

## 17. Environment variables

```
DATABASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
EMAIL_PROVIDER=postmark
POSTMARK_SERVER_TOKEN=
EMAIL_FROM_DOMAIN=
REPLY_DOMAIN=
INBOUND_WEBHOOK_SECRET=
LINK_SIGNING_SECRET=
MAPBOX_TOKEN=            # or none if using MapLibre with a free style
EMAIL_MODE=sandbox       # sandbox | live
APP_NAME=Venn
```

---

## 18. Acceptance criteria (definition of done for the demo)

- [ ] A signed-in user can go from typing a goal to a sent intro in under 60 seconds.
- [ ] Agent steps visibly stream; results show a reason per match.
- [ ] List, Map and Companies views work with combined filters.
- [ ] A reply in the sandbox inbox flips the request to **Replied** automatically.
- [ ] Not interested, Claim and Remove links all work and are idempotent.
- [ ] Re-importing the AA file never re-creates removed people or duplicates.
- [ ] No API response or LLM prompt contains contact data (tests pass).
- [ ] Students never appear unless they signed up.
- [ ] Every screen has loading, empty and error states.
