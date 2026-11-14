-- Member invites (2026-11-14). The invitee's email is NEVER stored: only a sha256 hash,
-- used to stop repeat invites and to honor "stop inviting me". Idempotent.
create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  inviter_profile_id uuid references profiles(id) on delete cascade,
  email_hash text not null,
  created_at timestamptz default now()
);
create index if not exists invites_hash_idx on invites (email_hash, created_at);

create table if not exists invite_optouts (
  email_hash text primary key,
  created_at timestamptz default now()
);

alter table invites enable row level security;
alter table invite_optouts enable row level security;

-- Sandbox mailbox can now hold invite emails (no profile yet): show a masked label instead.
alter table sandbox_emails add column if not exists to_label text;
alter table sandbox_emails alter column to_profile_id drop not null;
alter table sandbox_emails drop constraint if exists sandbox_emails_mailbox_check;
alter table sandbox_emails add constraint sandbox_emails_mailbox_check check (mailbox in ('recipient','sender','invitee'));

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on invites, invite_optouts from anon, authenticated;
  end if;
end $$;
