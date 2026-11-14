-- Referral links + LinkedIn sign-in (2026-11-14). Idempotent.
-- A member's personal invite link, and who joined through it. Venn never stores phone numbers
-- or contact lists: the member texts the link from their own phone.
create table if not exists invite_links (
  code text primary key,
  inviter_profile_id uuid not null unique references profiles(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists referrals (
  profile_id uuid primary key references profiles(id) on delete cascade,  -- the person who joined
  inviter_profile_id uuid not null references profiles(id) on delete cascade,
  code text not null,
  created_at timestamptz default now()
);
create index if not exists referrals_inviter_idx on referrals (inviter_profile_id);

-- "Continue with LinkedIn": only a hash of LinkedIn's subject id, to recognize a returning member.
-- No access tokens, photo, headline or LinkedIn email are stored.
create table if not exists linkedin_links (
  user_id uuid primary key references users(id) on delete cascade,
  sub_hash text not null unique,
  created_at timestamptz default now()
);

alter table invite_links enable row level security;
alter table referrals enable row level security;
alter table linkedin_links enable row level security;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on invite_links, referrals, linkedin_links from anon, authenticated;
  end if;
end $$;
