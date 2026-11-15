-- Optional passwords (2026-11-14). Idempotent.
-- After the first code sign-in a member can set a password; later sign-ins use email + password.
-- Only a salted scrypt hash is stored. Repeated wrong passwords lock password sign-in for a while
-- (a code still works).
alter table users add column if not exists password_hash text;
alter table users add column if not exists password_failures int not null default 0;
alter table users add column if not exists password_locked_until timestamptz;
