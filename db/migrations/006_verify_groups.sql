-- Verification methods, quiz, affinity groups (2026-11-14). Idempotent.

-- ---------------------------------------------------------------- verification
do $$ begin
  create type verification_method as enum ('gt_email','etranscript','diploma_photo','quiz');
exception when duplicate_object then null; end $$;

create table if not exists verifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  method verification_method not null,
  status text not null check (status in ('pending','approved','rejected','expired')),
  evidence jsonb not null default '{}',   -- extracted fields only. NEVER grades, NEVER the file.
  evidence_sha256 text,                   -- hash of an uploaded file, to block reuse
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index if not exists verifications_evidence_uniq on verifications (evidence_sha256) where evidence_sha256 is not null;
create index if not exists verifications_profile_idx on verifications (profile_id, created_at desc);

alter table profiles add column if not exists verified_method verification_method;
alter table profiles add column if not exists verified_at timestamptz;

-- Everyone who signed in with a school email so far is verified by GT email.
update profiles p set verified_method = 'gt_email', verified_at = coalesce(p.verified_at, p.created_at)
where p.status = 'claimed' and p.verified_at is null and p.user_id is not null;

create table if not exists quiz_questions (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  question text not null unique,
  correct text not null,
  distractors text[] not null,
  active boolean not null default true
);

-- One row per attempt; the served questions and answers live server-side only.
create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  question_ids uuid[] not null,
  current int not null default 0,          -- index of the question being answered
  served_at timestamptz,                   -- when the current question was sent (20s timer)
  options jsonb not null default '[]',     -- shuffled options per question (no key marked)
  correct int not null default 0,
  status text not null default 'in_progress' check (status in ('in_progress','passed','failed')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists quiz_attempts_profile_idx on quiz_attempts (profile_id, created_at desc);

-- ---------------------------------------------------------------- affinity groups
create table if not exists affinity_groups (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  slug text unique not null,
  name text not null,
  category text not null check (category in ('profession','identity','campus','military','college')),
  sensitive boolean not null default false,   -- identity-based: membership private by default
  description text not null,
  icon text not null,
  external_url text not null default 'https://www.gtalumni.org/affinity-groups/default.html'
);

create table if not exists group_memberships (
  group_id uuid references affinity_groups(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member','leader')),
  show_on_profile boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);
create index if not exists group_memberships_profile_idx on group_memberships (profile_id);

-- A group can point at its next event.
alter table events add column if not exists group_id uuid references affinity_groups(id) on delete set null;

-- Server-only access, like every other table (the app checks school, role and membership itself).
alter table verifications enable row level security;
alter table quiz_questions enable row level security;
alter table quiz_attempts enable row level security;
alter table affinity_groups enable row level security;
alter table group_memberships enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on verifications, quiz_questions, quiz_attempts, affinity_groups, group_memberships from anon, authenticated;
  end if;
end $$;
