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
- Never scrape LinkedIn or any third-party site for people's data, harvest contacts from members' inboxes, or guess email addresses. Profiles come only from GT Alumni Association records or the person themself (LinkedIn PDF / data-export import, profile builder). Invites store only an email hash.

## Stack
Next.js (App Router) + TypeScript + Tailwind + shadcn/ui · Postgres (Supabase) + pgvector · Claude API · Postmark (or Resend) with inbound webhooks · MapLibre/Mapbox + supercluster · Vitest + Playwright.

## Style
- "Game Day" navy + gold system (BUILD_SPEC.md §12, restyled 2026-11-14 per VENN_RESTYLE_INSTRUCTIONS). Navy (`--primary`) does the work; gold (`--accent`) only in small doses (gold button on navy panels, connected check, selected map pin, active-tab bar, chips). No plum, no Tech Gold #B3A369 fills, never gold text on white.
- Use token utilities from `src/app/globals.css` (`bg-canvas`, `text-text-muted`, `bg-primary`, `bg-accent-soft`, `hl`, `text-title-1`, `text-mono-sm` …). Never hardcode hex, fonts, radii or shadows in components (emails and /r pages inline the light values).
- Light + dark (`data-theme="dark"` or OS). Plus Jakarta Sans; Geist Mono for numbers/timestamps/distances. No emoji. Never use GT logos.
- Every screen has loading, empty and error states. WCAG AA, keyboard navigable, split views stack under 900px.

## Commands
- `npm run dev` — start the app (needs `.env`)
- `npm run db:migrate` / `npm run db:seed` / `npm run db:reset` (drops + reseeds via the real AA import)
- `npm test` — Vitest unit tests (local Docker DB `venn-testdb` on port 54329; never Supabase)
- `npm run build && npm run test:e2e` — Playwright E2E (production build on :3100, sandbox email, no AI key → fallback path)
- `npm run typecheck`

## Deadline
Submissions due **Sunday Nov 15, 9:00 AM ET**. If time is short, cut in this order: standing goals → admin dashboard → resume-based profile builder (use seeded profiles) → reminders. Never cut the end-to-end intro flow or the privacy guarantees.
