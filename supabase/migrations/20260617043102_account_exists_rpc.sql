-- account_exists(email) — server-side check for whether an email maps to a user.
--
-- The forgot-password screen calls this (via supabase.rpc) to BLOCK the recovery
-- flow for unregistered emails. The client cannot read auth.users (anon has no
-- access and resetPasswordForEmail is silent by design), so the check must run
-- server-side. SECURITY DEFINER lets the function read auth.users as its owner;
-- search_path is locked to '' so every reference must be schema-qualified.
--
-- SECURITY NOTE: this is a DELIBERATE user-enumeration surface — callers can probe
-- which emails have accounts. Accepted as a UX tradeoff. It returns ONLY a boolean
-- (no row data). v1 ships with no throttle; a per-IP rate-limit / CAPTCHA wrapper is
-- a documented follow-up. Do not widen this function's output.
create or replace function public.account_exists(p_email text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from auth.users
    where lower(email) = lower(trim(p_email))
      and deleted_at is null
  );
$$;

-- Existence == a non-soft-deleted row. We intentionally do NOT filter on
-- email_confirmed_at: this app uses confirmed-email signup, and a pending-but-real
-- signup must still count as "exists" or recovery would wrongly report "no account".
-- Supabase's recovery path does not gate on confirmation, so the reset email still
-- sends for unconfirmed accounts.

revoke all on function public.account_exists(text) from public;
grant execute on function public.account_exists(text) to anon, authenticated;
