# Venn @ Georgia Tech

Venn turns Georgia Tech's network into an agent that works for you:
1. You type a goal (or just a person's name).
2. The agent finds and ranks GT people, with a reason for each match.
3. It drafts an intro, which you edit and approve.
4. The recipient gets **one email**. "Reply to connect" (or replying) shares both addresses; "Not interested" shares nothing.

Built for the GT SGA × College of Lifetime Learning Campus Solutions Challenge.
- **Live demo:** https://venn-henna-seven.vercel.app
- Source of truth: [BUILD_SPEC.md](BUILD_SPEC.md)
- Security controls: [SECURITY.md](SECURITY.md)

## Quick start

```bash
npm install
cp .env.example .env            # fill in DATABASE_URL, ANTHROPIC_API_KEY and the secrets (see below)
npm run db:reset                # migrations + GT config + claimed members + REAL AA import + demo data
npm run dev                     # http://localhost:3000
```

**Supabase setup**
1. Create a project.
2. Go to Database → Extensions and enable `vector`.
3. Copy the **Session pooler** connection string into `DATABASE_URL`.

**Key settings (`.env`)**

| Setting | What it's for |
|---|---|
| `DATABASE_URL`, `ANTHROPIC_API_KEY` | Database and the agent (without the key, a rule-based fallback runs) |
| `EMAIL_MODE` | `sandbox`: emails land in `/dev/inbox` (plus real copies to `EMAIL_SANDBOX_ALLOWLIST`). `live`: real email |
| `EMAIL_PROVIDER` | `gmail` (demo: `GMAIL_USER` + a Google app password in `GMAIL_APP_PASSWORD`) or `postmark` |
| `DEMO_INBOX_EMAIL` | Real inbox that receives mail addressed to fictional demo people |
| `DEMO_RESET_EMAILS` | Login emails whose accounts the "Reset demo" menu item may erase |
| `APP_URL` | Public address used in email links |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | "Connect LinkedIn" in the profile builder |

Never commit `.env`. On Vercel the same values live under Project → Settings → Environment Variables.

## Demo guide

**Sign in**
- **GT email:** type an @gatech.edu address → 6-digit code → profile builder. Right after the code you can create a password (optional); later sign-ins are email + password.
- **No GT email:** on the sign-in page, "No GT email? Verify with **Transcript** / **Diploma**". Upload the file with a personal email. *Demo: approved automatically and a "You're verified" email goes out at once;* then sign in with that personal email.
- **Demo picker:** "Continue with school login" lists fictional identities:
  - **Alex Kim** (student, full profile, sent requests)
  - **Morgan Ellis** (alum, receives intros; use him for Events and Groups)
  - Jordan Lee / Sam Rivera / Riley Chen are brand-new users who go through the profile builder.

**Things to show**
- **Find:** type a goal ("Product designers at Delta who mentor") or a member's name.
- **Requests:** click a sent message to read it in full; replies flip status live.
- **Events** and **Groups** are **alumni-only**: students don't see the tabs and are redirected or refused by the APIs.
- **Profile builder:** upload a resume or LinkedIn PDF to fill the profile (including the name), connect LinkedIn, then **Approve & publish** (required fields are marked with *).
- **/verify:** your verification badges and other ways to verify.

**Starting over:** signed in as one of `DEMO_RESET_EMAILS`, open the avatar menu → **Reset demo (erase my account)**. It erases those accounts and everything tied to them, so you can sign up as new.

**Sandbox only** (`EMAIL_MODE=sandbox`): emails to fictional people land in **/dev/inbox**, where you can reply as the recipient; "Simulate 5 days passing" fires the reminder and no-response jobs; **/admin** has the Alumni Association import and the engagement dashboard.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app |
| `npm run db:migrate` | Apply migrations (idempotent; every file re-runs) |
| `npm run db:seed` / `npm run db:reset` | Seed (reset drops all tables first) through the real AA import pipeline |
| `npm run db:seed:demo` | Demo people, intros, events, groups only (fast; refreshes event dates) |
| `npm run db:repair` | Rebuild missing search entries / map locations for published members |
| `npm run email:test [-- someone@gatech.edu]` | Send a sample email through the configured provider |
| `npm run verify:approve [-- email] [--reject]` | List or decide pending verification requests |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run typecheck` | TypeScript |
| `npx vercel deploy --prod` | Deploy to the live site (pushing to GitHub does not deploy by itself) |

Tests use a disposable local Postgres, never your Supabase project:

```bash
docker run -d --name venn-testdb -e POSTGRES_PASSWORD=venn -e POSTGRES_DB=venn -p 54329:5432 pgvector/pgvector:pg16
npm test && npm run build && npm run test:e2e
```

On Windows, run Vitest from `C:\…` (capital drive letter); a lowercase `c:\` path breaks Vitest's suite detection.

## Growth without scraping

- **Import from LinkedIn:** members upload their own LinkedIn PDF or data-export .zip. Only profile, positions, education and skills are read.
- **Connect LinkedIn:** after GT verification, members can connect LinkedIn (it shares only name + email) and add their profile link, which signed-in members see as a LinkedIn button.
- **Claim with LinkedIn:** every intro to an unclaimed alum invites them to claim their profile.
- **Invite a Yellow Jacket:** by email (only a hash of the address is kept) or a personal invite link to text.
- **Demo people:** fictional demo profiles live in `mock-data/demo_people.json`.

## How it fits together

- **Agent** (`src/server/agent/`): `parse_goal` → `search_profiles` (SQL filters + pgvector) → `rank_matches` → `draft_intro` / `rewrite_intro`. A query that is just a member's name returns those members directly. Steps stream over SSE; every LLM call has a timeout and a rule-based fallback.
- **Sign-in** (`src/server/signinCodes.ts`, `passwords.ts`, `verification.ts`): 6-digit codes (hashed, rate-limited), optional scrypt passwords with lockout, and transcript/diploma verification for personal-email accounts. A database trigger refuses non-school login emails unless the account was verified by document.
- **AA import** (`src/server/import/aa.ts`): all 12 rules from spec §6.
- **Email** (`src/server/email/`): Gmail (demo) or Postmark. Intros carry a "Reply to connect" button (one-tap confirm page) and a relay Reply-To; connecting emails both people each other's address. Sign-in codes and "You're verified" emails are sent right after the response, so screens don't wait on email.
- **Events** (`src/server/events.ts`) and **affinity groups** (`src/server/groups.ts`): alumni-only via one rule in `src/lib/roles.ts`. Identity-based groups are private by default, and "You both" counts a group only when both people show it.
- **Privacy:** `PublicProfile` allowlist DTO, contact data isolated in `contact_points`, opt-in `shared_contact`, k-anonymous map clusters, venue-only event pins. See [SECURITY.md](SECURITY.md).
- **Hosting:** Vercel (`pdx1`, next to the Supabase database in us-west-2); API routes are capped at 60 s.

## Notes and deviations from the spec

- **Embeddings.** Anthropic has no embeddings API. Venn uses a local 1024-dim hashing embedder by default and Voyage (`voyage-3.5`) when `VOYAGE_API_KEY` is set.
- **Verification is a demo.** Transcript and diploma uploads aren't actually checked (any file counts) and are approved instantly. Files are never stored, only a hash to block reuse.
- **Email from Gmail.** Reliable enough for a demo, but GT's Outlook may file messages under Junk. A Postmark/Resend sender on your own domain is faster and lands better.
- **Opt-in contact sharing.** Members may show contact details to signed-in GT members. Unclaimed people stay relay-only. No in-app chat.
- **Email links.** `/r/{token}/connect|decline|remove` show a one-button confirm page and act on POST, so email link scanners can't trigger them.
- **Map locations.** City-level only; a city not in the built-in list is placed at its state's main metro.
