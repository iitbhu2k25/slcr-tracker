-- Adds self-service "Forgot password" support.
-- Run once in Supabase → SQL Editor (safe to run more than once).

alter table public.users add column if not exists reset_hash    text;
alter table public.users add column if not exists reset_expires timestamptz;

-- Setting a password also cancels any pending emailed one-time password.
create or replace function public.set_password(p_id bigint, p_hash text, p_must_change boolean)
returns void language sql security definer set search_path = public as $$
  update public.users
     set password_hash = p_hash, must_change_pw = p_must_change, pw_version = pw_version + 1,
         reset_hash = null, reset_expires = null
   where id = p_id;
$$;
revoke execute on function public.set_password(bigint, text, boolean) from public, anon, authenticated;
