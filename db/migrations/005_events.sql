-- Events near you (2026-11-14). Idempotent.
-- Venues only: events store the VENUE's coordinates, never anyone's location.
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  title text not null check (char_length(title) <= 80),
  description text check (char_length(description) <= 600),
  category text not null check (category in ('game_watch','career','social','volunteer','family','member_hosted')),
  source text not null check (source in ('network','member')),   -- network = official GT regional network; member = hosted by a Venn user
  host_label text not null,                                      -- 'Atlanta Network' or the host's display name
  host_profile_id uuid references profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  city text not null,
  neighborhood text,
  venue_name text not null,
  venue_address text not null,
  lat double precision not null,
  lng double precision not null,
  external_url text,
  is_featured boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists events_city_time_idx on events (school_id, city, starts_at);

create table if not exists event_rsvps (
  event_id uuid references events(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);
create index if not exists event_rsvps_profile_idx on event_rsvps (profile_id);

-- Server-only access (the app connects with the service role and checks school, membership and
-- ownership itself, like every other table): clients get nothing directly.
alter table events enable row level security;
alter table event_rsvps enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on events, event_rsvps from anon, authenticated;
  end if;
end $$;
