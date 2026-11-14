-- Verified without a GT email (2026-11-14). Idempotent.
-- An account may use a personal (non-school) login email only if it was created through a
-- transcript or diploma verification. The app sets verified_via only after that step.
alter table users add column if not exists verified_via text
  check (verified_via is null or verified_via in ('etranscript','diploma_photo'));

create or replace function require_school_domain() returns trigger language plpgsql as $$
declare
  d text := lower(split_part(new.login_email, '@', 2));
  ok boolean;
begin
  if new.verified_via in ('etranscript','diploma_photo') then
    return new;  -- verified by document: personal email allowed
  end if;
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
create trigger users_require_school_domain before insert or update of login_email, verified_via on users
  for each row execute function require_school_domain();
