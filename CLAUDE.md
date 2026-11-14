# Venn — project instructions for Claude Code

Venn turns Georgia Tech's network into an agent that works for you: a user types a goal, the agent finds and ranks GT people, drafts an intro the user approves, and the recipient gets one email they can reply to (no app or account needed).

## Source of truth
- Follow @BUILD_SPEC.md. If something in it is unclear or conflicts with a request, ask before guessing.
- Build in the order of BUILD_SPEC.md §16, one block at a time. Plan first, then code, then run tests before moving on.

## Data
- Mock data is in `mock-data/` (fictional people, reserved email domains). Regenerate with:
  `python3 scripts/generate_mock_data.py [--alumni 600] [--members 60] [--seed 42]`
- Seed the database through the **real** Alumni Association import pipeline (BUILD_SPEC.md §6), never a shortcut.

## Non-negotiables
- Contact data (any email or phone number) never appears in API responses, the UI, logs shown to users, or LLM prompts. Relay addresses live only in `contact_points` (service role).
  - **Exception (product decision 2026-11-14):** a claimed member may opt in, per field, to show a preferred email, phone, LinkedIn URL and website to **signed-in GT users only**. These live in `shared_contact`, are served only by `GET /api/profiles/:id/contact` (audited), are never in `PublicProfile`, and are never sent to the LLM. Unclaimed/AA people and members who don't opt in are reachable only through the email relay. No in-app chat.
- Current students never appear unless they signed up and approved their profile; `ferpa_restricted` profiles never appear.
- Removed people go to the suppression list and are never re-created by an import.
- The agent can never send an intro without an explicit user click.
- Locations are rounded to ~1 km; hide map clusters with fewer than 3 people at close zoom.
- No user quotas or reputation scores (product decision); only a per-minute bot throttle on API routes.

## Stack
Next.js (App Router) + TypeScript + Tailwind + shadcn/ui · Postgres (Supabase) + pgvector · Claude API · Postmark (or Resend) with inbound webhooks · MapLibre/Mapbox + supercluster · Vitest + Playwright.

## Style
- Tokens and layout from BUILD_SPEC.md §12 (rebranded 2026-11-14 to the Venn plum palette from `Venn — Login.pdf`): plum #7A3E6A for primary actions, petal #C0699B only as a small accent (focus ring, active nav, selected map cluster), soft blush-gray background. Plus Jakarta Sans everywhere; lowercase "venn" wordmark. Never use official GT logos.
- `#9C93A0` is for icons/placeholders only (fails AA for small text); readable secondary text uses `#625A66`.
- Every screen has loading, empty and error states. WCAG AA contrast, keyboard navigable, split views stack under 900px.

## Commands
- `npm run dev` — start the app (needs `.env`)
- `npm run db:migrate` / `npm run db:seed` / `npm run db:reset` (drops + reseeds via the real AA import)
- `npm test` — Vitest unit tests (local Docker DB `venn-testdb` on port 54329; never Supabase)
- `npm run build && npm run test:e2e` — Playwright E2E (production build on :3100, sandbox email, no AI key → fallback path)
- `npm run typecheck`

## Deadline
Submissions due **Sunday Nov 15, 9:00 AM ET**. If time is short, cut in this order: standing goals → admin dashboard → resume-based profile builder (use seeded profiles) → reminders. Never cut the end-to-end intro flow or the privacy guarantees.
