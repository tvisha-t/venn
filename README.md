# Venn @ Georgia Tech

Venn turns Georgia Tech's network into an agent that works for you:
1. You type a goal.
2. The agent finds and ranks GT people, with a reason for each match.
3. It drafts an intro, which you edit and approve.
4. The recipient gets **one email**. Replying connects you, and "Not interested" shares nothing.

Built for the GT SGA × College of Lifetime Learning Campus Solutions Challenge.
- Source of truth: [BUILD_SPEC.md](BUILD_SPEC.md)
- Security controls: [SECURITY.md](SECURITY.md)

## Quick start

```bash
npm install
cp .env.example .env            # fill in DATABASE_URL (Supabase) + ANTHROPIC_API_KEY + two secrets
npm run db:reset                # migrations + GT config + claimed members + REAL AA import + sample intros
npm run dev                     # http://localhost:3000
```

**Supabase setup**
1. Create a project.
2. Go to Database → Extensions and enable `vector`.
3. Copy the **Session pooler** connection string into `DATABASE_URL`.

**Demo tips**
- Sign in with any demo identity. "Jordan Lee", "Sam Rivera" and "Riley Chen" are brand-new users who go through the profile builder.
- Emails to fictional people land in **/dev/inbox**. There you can reply as the recipient, or click Not interested, Claim or Remove.
- "Simulate 5 days passing" in /dev/inbox fires the reminder and no-response jobs.
- **/admin** has the Alumni Association CSV import with its summary table, plus the engagement dashboard.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app |
| `npm run db:migrate` | Apply migrations (idempotent) |
| `npm run db:seed` / `npm run db:reset` | Seed (reset drops all tables first) through the real AA import pipeline |
| `npm test` | Unit tests (Vitest): import rules, agent fallback, state machine, signed links, privacy, opt-in contact |
| `npm run test:e2e` | Playwright: the 8 §15 scenarios, claim flow, API privacy crawl |
| `npm run typecheck` | TypeScript |

Tests use a disposable local Postgres, never your Supabase project:

```bash
docker run -d --name venn-testdb -e POSTGRES_PASSWORD=venn -e POSTGRES_DB=venn -p 54329:5432 pgvector/pgvector:pg16
npm test && npm run build && npm run test:e2e
```

## How it fits together

- **Agent** (`src/server/agent/`): `parse_goal` → `search_profiles` (SQL filters + pgvector) → `rank_matches` → `draft_intro` / `rewrite_intro`. Steps stream to the UI over SSE. Every LLM call has a timeout and a rule-based fallback.
- **AA import** (`src/server/import/aa.ts`): all 12 rules from spec §6. The default mock file yields 555 unclaimed profiles (606 rows − 27 excluded − 6 duplicates − 18 merged with claimed members).
- **Email relay** (`src/server/intros.ts`, `src/server/email/`): `Reply-To: reply+{token}@…` → inbound webhook → status `replied` → the reply is forwarded to the sender with the recipient's address (the consented share).
- **Privacy**: `PublicProfile` allowlist DTO, contact data isolated in `contact_points`, opt-in `shared_contact`, k-anonymous map clusters. See [SECURITY.md](SECURITY.md).

## Notes and deviations from the spec

- **Embeddings.** Anthropic has no embeddings API. Venn uses a local 1024-dim hashing embedder by default and Voyage (`voyage-3.5`, 1024-dim) when `VOYAGE_API_KEY` is set.
- **Opt-in contact sharing.** Members may opt in to show contact details to signed-in GT members (product decision 2026-11-14). Unclaimed people stay relay-only. There is no in-app chat.
- **Email links.** `/r/{token}/decline|remove` show a one-button confirm page and act on POST, so email link scanners can't trigger them.
- **No per-person coordinates.** Profiles carry no coordinates, so the Map tab on goal results groups by city. The Explore map uses server-side clusters.
- **Map fallback.** If a device can't render the map (no WebGL, or tiles unreachable), the same groups appear as a list.
