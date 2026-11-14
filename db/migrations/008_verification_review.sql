-- Manual review for transcript/diploma verification (2026-11-14). Idempotent.
-- A request is made BEFORE an account exists: it carries the personal email and (until a decision)
-- the uploaded file for the reviewer. On approve/reject the file is deleted automatically.
alter table verifications alter column profile_id drop not null;
alter table verifications add column if not exists personal_email text;   -- PRIVATE: sign-in address once approved
create index if not exists verifications_email_idx on verifications (lower(personal_email)) where personal_email is not null;

create table if not exists verification_files (
  verification_id uuid primary key references verifications(id) on delete cascade,
  file_name text not null,
  mime text not null,
  content bytea not null
);
alter table verification_files enable row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on verification_files from anon, authenticated;
  end if;
end $$;

-- Approving or rejecting (e.g. in the Supabase table editor) deletes the file and stamps the decision.
create or replace function verification_decided() returns trigger language plpgsql as $$
begin
  if new.status in ('approved','rejected','expired') and old.status = 'pending' then
    delete from verification_files where verification_id = new.id;
    if new.decided_at is null then new.decided_at := now(); end if;
    -- Approving a request that is already tied to a profile marks that profile verified.
    if new.status = 'approved' and new.profile_id is not null then
      update profiles set verified_method = coalesce(verified_method, new.method), verified_at = coalesce(verified_at, now())
      where id = new.profile_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists verifications_decided on verifications;
create trigger verifications_decided before update of status on verifications
  for each row execute function verification_decided();
