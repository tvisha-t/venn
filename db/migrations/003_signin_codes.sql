-- School-email verification (2026-11-14). Idempotent.
-- 6-digit sign-in codes. Never stores the email or the code: only hashes.
create table if not exists signin_codes (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null,
  code_hash text not null,
  ip_hash text,
  attempts int not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists signin_codes_email_idx on signin_codes (email_hash, created_at desc);
create index if not exists signin_codes_ip_idx on signin_codes (ip_hash, created_at desc);
alter table signin_codes enable row level security;

-- Sandbox mailbox can hold sign-in code emails (no profile yet).
alter table sandbox_emails drop constraint if exists sandbox_emails_mailbox_check;
alter table sandbox_emails add constraint sandbox_emails_mailbox_check check (mailbox in ('recipient','sender','invitee','signin'));

-- Defense in depth: no account can be created for an email outside an allowed school domain,
-- whatever code path inserts it. Domains come from schools.config ("domains", plus "demo_domains"
-- for the fictional seed data). Exact domain or a true subdomain only.
create or replace function require_school_domain() returns trigger language plpgsql as $$
declare
  d text := lower(split_part(new.login_email, '@', 2));
  ok boolean;
begin
  select exists (
    select 1 from schools s,
      jsonb_array_elements_text(coalesce(s.config->'domains', '[]'::jsonb) || coalesce(s.config->'demo_domains', '[]'::jsonb)) a
    where d = a or d like '%.' || a
  ) into ok;
  if not ok then
    raise exception 'Use your school email to join Venn.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists users_require_school_domain on users;
create trigger users_require_school_domain before insert or update of login_email on users
  for each row execute function require_school_domain();

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on signin_codes from anon, authenticated;
  end if;
end $$;
