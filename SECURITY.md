# Venn: Security & Privacy Controls

Venn handles data that Georgia Tech would classify as **Protected**: names, education records, employers, and contact details. This document maps Venn's controls to the HECVAT Lite sections and to the specific privacy requirements in `BUILD_SPEC.md` §13.

Everything listed under "Verified by" is an automated test in this repo (`npm test`, `npm run test:e2e`).

---

## 1. Data inventory and classification

| Data | Where | Who can read it |
|---|---|---|
| Public profile fields (name, class year, major, GT programs, employer, title, industry, city) | `profiles` | Signed-in GT members, via the `PublicProfile` DTO only |
| Relay addresses (login email, email on file from GT records, EMFL alias) | `contact_points`, `users.login_email` | **Server only.** Read solely by `src/server/contact.ts` to send email. Every read is audit-logged |
| Opt-in contact details (preferred email, phone, LinkedIn, website) | `shared_contact` | Signed-in GT members, **only if the member opted in to that field**, via one route. Every view is audit-logged |
| Suppression hashes | `suppression_list` | Server only (sha256 of lower-cased email + record id) |
| Intro messages and reply previews | `intro_requests` | The sender only |
| Audit trail | `audit_log` | Server/admin only (aggregates in the admin UI) |

All tables have Row Level Security enabled. `contact_points`, `shared_contact`, `suppression_list`, `audit_log` and `users` have **no client policies**, so Supabase anon/authenticated keys cannot read them. The app server uses the service role.

## 2. Access control (HECVAT: Authentication, Authorization)

- **Verified sign-in only.** Every API route except the signed email links and provider webhooks requires a session. The session cookie is HMAC-signed, `httpOnly`, `SameSite=Lax`, `Secure` in production, and expires after 7 days.
- **GT Login adapter.** `IdentityProvider` interface (`src/server/identity.ts`). The demo uses `MockGtLogin`. Production swaps in CAS/SAML against GT Login once OIT approves it. No other code changes.
- **Least privilege in code.** Only `contact.ts` selects from `contact_points`. Only `sharedContact.ts` selects from `shared_contact`. All other profile reads go through `PUBLIC_COLUMNS` and `toPublicProfile()`, an explicit allowlist that structurally cannot carry contact fields.
- **Admin.** The import/dashboard require the `staff` role in production. In sandbox demo mode any signed-in user can open it so judges can try it.
- **Verified by:** `privacy.spec.ts` (unauthenticated requests get `401`).

## 3. Contact data never exposed

- Contact data never appears in API responses, the UI, user-visible logs, or LLM prompts.
- **The one exception is consent-based** (product decision 2026-11-14). A claimed member may opt in, per field, to show a preferred email, phone, LinkedIn URL or website to signed-in GT members. These details:
  - are off by default and revocable at any time;
  - are never shown to signed-out visitors;
  - are never in `PublicProfile` and never sent to the AI;
  - are served only by `GET /api/profiles/:id/contact`, which writes a `shared_contact.view` audit row;
  - are logged on update by field name only, never by value.
- **Unclaimed alumni (from Georgia Tech records) can never share contact details.** They are reachable only through the email relay. There is no in-app chat.
- **Email addresses are consent-shared only by replying.** The recipient's address reaches the sender only when the recipient replies, because the reply is forwarded with their address in `Reply-To`.
- **Verified by:**
  - `privacy.spec.ts`: crawls every API route with seeded data and asserts no email or phone pattern.
  - `agent.test.ts`: asserts no contact data in any LLM payload.
  - `sharedContact.test.ts`: opt-in, audit, revocation, and the unclaimed restriction.

## 3a. Data sourcing (no scraping)

- Profiles come only from **Georgia Tech records** (with the §6 import rules and one-tap removal) or from **the person themself**.
- **LinkedIn import is the member's own data.** They upload a LinkedIn PDF or their own "Get a copy of your data" export. From the .zip, only `Profile.csv`, `Positions.csv`, `Education.csv` and `Skills.csv` are decompressed (`src/server/linkedinExport.ts`). `Connections.csv`, messages, email addresses, phone numbers and invitations, which hold other people's data or private contact data, are never opened. Free text is scrubbed of emails, phones and links.
- **No scraping or enrichment.** Venn never scrapes LinkedIn or any third-party site, never harvests contacts from members' inboxes, and never guesses email addresses.
- **Invites.** "Invite a Yellow Jacket" sends one email. The invitee's address is used only for that send and is not stored. Venn keeps only a sha256 hash to block repeat invites for 30 days and to honor the "Don't send me invites" link. Members and opted-out or suppressed addresses are silently skipped, and the response is the same either way, so the endpoint can't reveal who is on Venn. Audit rows record that an invite was sent, never the address or hash. Invite hashes are deleted after 1 year.
- **Verified by:** `growth.test.ts` (allowlist, contact stripping, hash-only storage, opt-out, no re-invite) and the invite E2E test.

## 4. FERPA (students)

- Students appear **only** after they sign in and approve their profile. The GT records import never creates student profiles (`class_year ≤ current year`, role `alum` only).
- `ferpa_restricted` profiles are hidden everywhere (`VISIBLE_PREDICATE` in `src/server/dto.ts`).
- **Verified by:** `privacy.spec.ts` (FERPA student never appears), `import.test.ts` (rule 6).

## 5. Encryption (HECVAT: Data)

- TLS everywhere (Vercel + Supabase).
- Encryption at rest: Supabase default (AES-256). `pgcrypto` is enabled and is used for email hashing in SQL.
- Suppression entries store sha256 hashes, not addresses.
- Signed links use 32 random bytes plus HMAC-SHA256 and expire after 60 days. Webhooks are verified by HMAC (or a shared secret in the Postmark basic-auth URL).

## 6. Logging and monitoring (HECVAT: Logging)

`audit_log` records:
- `contact.read`: every read of a relay address, with its purpose;
- `intro.send`, `intro.reminder`, `intro.reply_forward`, `intro.decline`;
- `profile.claim`, `profile.approve`, `profile.remove`;
- `aa.import`: one row per run, counts only;
- `shared_contact.view` and `shared_contact.update`;
- `email.bounce`.

Server errors are logged without request bodies. Clients receive generic error messages, never stack traces.

## 7. Opt-out and data retention

- **Remove me** (one-tap link in every email to an unclaimed person, then a confirm page):
  - sets the profile to `removed` and wipes its personal fields;
  - deletes `contact_points` and `shared_contact`;
  - adds hashes to `suppression_list`.

  Re-imports skip suppressed people by record id or email hash. If a person opts out of the directory in GT's records, the next import purges their imported profile.
- **Retention** (`src/server/retention.ts`, runs hourly):
  - message bodies of declined, no-response and bounced intros are deleted after 180 days;
  - their metadata is deleted after 1 year;
  - sandbox emails are deleted after 30 days.
- **Verified by:** `import.test.ts` (suppression and purge), `intros.test.ts` and `flow.spec.ts` scenario 7 (remove, then re-import).

## 8. Location privacy

- Coordinates are rounded to 2 decimals (about 1 km). The GT records import geocodes to a city centroid, jitters by up to about 3 km, then rounds.
- Per-person coordinates are **never** returned by any API. The map endpoint returns only aggregate clusters. Above city zoom (> 10), clusters with fewer than 3 people are hidden, and their member lists are refused (k-anonymity).
- **Verified by:** `intros.test.ts` (location privacy), `privacy.spec.ts` (no `lat`/`lng` outside the map).

## 9. AI safety

- No contact data in prompts. Resumes are scrubbed of emails, phone numbers, links and street addresses **before** the model sees them.
- Profile text is wrapped as untrusted data, and system prompts tell the model to ignore instructions inside it.
- Model output is validated against Zod schemas. Invented filter values are dropped. Drafts are post-filtered for emails, links and phone numbers and capped at 120 words.
- **The agent cannot send.** `POST /api/intros/:id/send` requires `userConfirmed: true` from the composer's Send button. A row-level state check prevents double sends.
- **Graceful degradation.** Any LLM error, timeout or refusal falls back to a rule-based parser, ranker and template, so the flow never dead-ends.

## 10. Abuse resistance

- One open intro per sender and recipient (unique index plus an app check). One reminder at most.
- Per-minute **burst throttle** on API routes, for bot protection only. There are no user quotas or reputation scores (product decision).
- Do-not-contact, bounced and suppressed recipients cannot receive intros.
- Signed links show a confirm page and act only on POST, so email security scanners that prefetch links cannot decline or remove someone.

## 11. Incident response

1. Rotate `LINK_SIGNING_SECRET`, `INBOUND_WEBHOOK_SECRET` and the Supabase service key. Rotating the link secret also invalidates all outstanding email links and sessions.
2. Query `audit_log` for `contact.read` and `shared_contact.view` in the window to scope exposure.
3. Notify GT OIT Cyber Security per GT policy. Notify affected people.
4. Set `EMAIL_MODE=sandbox` to halt all outbound email immediately.

## 12. Known limitations / roadmap

- **GT Login is mocked.** A real CAS/SAML integration needs OIT approval.
- **Field encryption.** `contact_points` relies on Supabase at-rest encryption. Field-level `pgcrypto` encryption of addresses is a planned hardening step.
- **Throttle storage.** The rate limiter is in-memory per instance. Production should move it to Postgres or Redis.
