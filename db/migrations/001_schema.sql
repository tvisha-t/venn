-- Venn schema (BUILD_SPEC.md §5). Idempotent: safe to re-run.
create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  config jsonb not null default '{}'
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  auth_subject text unique not null,
  login_email text not null,                       -- PRIVATE
  created_at timestamptz default now()
);

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id) not null,
  user_id uuid references users(id),
  status text not null check (status in ('claimed','unclaimed','removed')),
  source text not null check (source in ('self','alumni_association')),
  aa_constituent_id text,
  first_name text not null,
  last_name text not null,
  roles text[] not null,
  class_year int,
  degree text,
  major text,
  college text,
  gt_programs text[] default '{}',
  cs_threads text[] default '{}',
  activities text[] default '{}',
  industry text,
  employer text,
  job_title text,
  city text, state text, country text,
  lat numeric(6,2), lng numeric(6,2),              -- rounded to ~1 km
  summary text,
  summary_approved boolean default false,
  open_to text[] default '{}',
  interests text[] default '{}',
  contact_channel text default 'email',            -- SMS is roadmap; email only in MVP
  ferpa_restricted boolean not null default false, -- hidden everywhere when true
  aa_last_updated date,
  embedding vector(1024),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists profiles_school_aa_uniq
  on profiles (school_id, aa_constituent_id) where aa_constituent_id is not null;
create index if not exists profiles_status_idx on profiles (status);
create index if not exists profiles_employer_idx on profiles (lower(employer));

create table if not exists contact_points (       -- PRIVATE, service role only
  profile_id uuid primary key references profiles(id) on delete cascade,
  email_primary text,
  email_emfl_alias text,
  do_not_contact boolean default false,
  bounced boolean default false,
  updated_at timestamptz default now()
);

create table if not exists suppression_list (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools(id),
  email_hash text,
  aa_constituent_id text,
  created_at timestamptz default now()
);
create index if not exists suppression_email_idx on suppression_list (email_hash);
create index if not exists suppression_aa_idx on suppression_list (aa_constituent_id);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid references profiles(id) not null,
  raw_text text not null,
  parsed jsonb not null,
  standing boolean default false,
  relaxed text[] default '{}',
  last_run_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists goal_parse_cache (     -- cost guard (§7.4)
  normalized_text text primary key,
  parsed jsonb not null,
  created_at timestamptz default now()
);

create table if not exists goal_matches (
  goal_id uuid references goals(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  score numeric,
  reason text,
  rank int,
  notified boolean default false,
  is_new boolean default false,
  created_at timestamptz default now(),
  primary key (goal_id, profile_id)
);

create table if not exists intro_requests (
  id uuid primary key default gen_random_uuid(),
  sender_profile_id uuid references profiles(id) not null,
  recipient_profile_id uuid references profiles(id) not null,
  goal_id uuid references goals(id),
  subject text,
  message text not null,
  status text not null check (status in ('draft','sent','replied','not_interested','no_response','bounced','suppressed')),
  relay_token text unique not null,
  reply_preview text,
  sender_seen_reply boolean default true,
  sent_at timestamptz,
  reminder_sent_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists intro_sender_idx on intro_requests (sender_profile_id);
-- one OPEN intro per sender→recipient
create unique index if not exists intro_open_uniq on intro_requests (sender_profile_id, recipient_profile_id)
  where status in ('sent');

create table if not exists relay_messages (
  id uuid primary key default gen_random_uuid(),
  intro_id uuid references intro_requests(id) on delete cascade,
  direction text check (direction in ('outbound','inbound')),
  provider_message_id text unique,
  received_at timestamptz default now()
);

-- Sandbox mailbox for EMAIL_MODE=sandbox (/dev/inbox). Stores recipient by
-- profile id / role, never by address.
create table if not exists sandbox_emails (
  id uuid primary key default gen_random_uuid(),
  intro_id uuid references intro_requests(id) on delete cascade,
  mailbox text not null check (mailbox in ('recipient','sender')),
  to_profile_id uuid references profiles(id) on delete cascade,
  from_name text not null,
  reply_to_label text,
  subject text not null,
  html text not null,
  text_body text not null,
  kind text not null,                               -- intro | reminder | reply_forward | notification
  created_at timestamptz default now()
);

create table if not exists audit_log (
  id bigserial primary key,
  actor text not null,
  action text not null,
  target_id uuid,
  meta jsonb,
  at timestamptz default now()
);

create table if not exists rate_limits (            -- per-minute bot throttle only, not a quota
  bucket text primary key,
  window_start timestamptz not null,
  count int not null
);

-- ---------------------------------------------------------------- RLS
-- The Next.js server connects with the service role (bypasses RLS). These
-- policies lock down any direct client access with Supabase anon/authenticated keys.
alter table schools          enable row level security;
alter table users            enable row level security;
alter table profiles         enable row level security;
alter table contact_points   enable row level security;
alter table suppression_list enable row level security;
alter table goals            enable row level security;
alter table goal_parse_cache enable row level security;
alter table goal_matches     enable row level security;
alter table intro_requests   enable row level security;
alter table relay_messages   enable row level security;
alter table sandbox_emails   enable row level security;
alter table audit_log        enable row level security;
alter table rate_limits      enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    -- profiles: any signed-in user reads non-removed, non-FERPA rows; owner updates own.
    drop policy if exists profiles_read on profiles;
    create policy profiles_read on profiles for select to authenticated
      using (status <> 'removed' and not ferpa_restricted);
    drop policy if exists profiles_owner_update on profiles;
    create policy profiles_owner_update on profiles for update to authenticated
      using (user_id::text = auth.uid()::text);
    drop policy if exists goals_owner on goals;
    create policy goals_owner on goals for all to authenticated
      using (owner_profile_id in (select id from profiles where user_id::text = auth.uid()::text));
    drop policy if exists intros_owner on intro_requests;
    create policy intros_owner on intro_requests for all to authenticated
      using (sender_profile_id in (select id from profiles where user_id::text = auth.uid()::text));
    drop policy if exists schools_read on schools;
    create policy schools_read on schools for select to authenticated using (true);
    -- contact_points, suppression_list, audit_log etc.: no policies = no client access.
    revoke all on contact_points, suppression_list, audit_log, users from anon, authenticated;
  end if;
end $$;

-- Opt-in contact details a member CHOSE to show to signed-in GT users (product
-- decision 2026-11-14). Separate from contact_points (private relay addresses).
-- A row/field exists only if the member opted in; deleting it revokes sharing.
create table if not exists shared_contact (
  profile_id uuid primary key references profiles(id) on delete cascade,
  preferred_email text,
  phone text,
  linkedin_url text,
  website_url text,
  updated_at timestamptz default now()
);
alter table shared_contact enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on shared_contact from anon, authenticated;
  end if;
end $$;
