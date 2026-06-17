-- Harden account_exists: remove the anon enumeration oracle.
--
-- The original migration granted EXECUTE to anon + authenticated, making the function
-- an open, unthrottled user-enumeration surface (any caller with the publishable key
-- could probe which emails have accounts). We now restrict EXECUTE to `service_role`
-- only. The sole caller is the `check-email` Edge Function, which requires a verified
-- Cloudflare Turnstile token BEFORE invoking this RPC with the service-role key — so the
-- enumeration check is now CAPTCHA-gated (a real, non-spoofable boundary) instead of an
-- open boolean oracle. The function body (boolean-only, security definer, search_path='')
-- is unchanged; only who may call it changes.
revoke execute on function public.account_exists(text) from anon, authenticated, public;
grant  execute on function public.account_exists(text) to service_role;
