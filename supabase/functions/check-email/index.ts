// check-email: Mobile App -> this Edge Function -> account_exists RPC.
//
// Replaces the old anon-callable `account_exists` enumeration oracle. The RPC is now
// granted to `service_role` ONLY (see the drop/harden migration), so the sole way to
// learn whether an email is registered is through this function — and this function
// REQUIRES a valid Cloudflare Turnstile token, verified server-side. That makes the
// enumeration surface a real (non-spoofable) boundary instead of an open boolean oracle.
//
// Flow:
//   1. POST { email, captchaToken }  (reject non-POST 405, missing fields 400)
//   2. Verify captchaToken via Turnstile siteverify using TURNSTILE_SECRET_KEY (a secret,
//      never shipped to the client). On failure -> { exists:false, error:'captcha_failed' }.
//   3. admin (service-role) calls public.account_exists(p_email) and returns { exists }.
//
// Mirrors ai-coach: never throws to the client, opaque error codes, no internal leakage.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/** Verify a Turnstile token with Cloudflare. Returns true only on a confirmed success. */
async function verifyTurnstile(token: string, remoteip: string | null): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secret) {
    // Fail closed: a missing secret must never silently allow the check through.
    console.error('[check-email] TURNSTILE_SECRET_KEY not configured');
    return false;
  }
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (remoteip) form.set('remoteip', remoteip);
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data = await res.json().catch(() => ({}));
    return data?.success === true;
  } catch (e) {
    console.error('[check-email] siteverify request failed', e);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ exists: false, error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const captchaToken = typeof body?.captchaToken === 'string' ? body.captchaToken : '';
    // App-level outcomes return 200 with an { exists, error } body (mirrors ai-coach) so
    // the client reads the exact reason: a non-null `error` means "couldn't check, retry",
    // never "no account". Only `exists === false` with no error means no account.
    if (!email || !captchaToken) {
      return json({ exists: false, error: 'missing_fields' });
    }

    // 1. CAPTCHA is the boundary — verify before touching the database.
    const remoteip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
    const ok = await verifyTurnstile(captchaToken, remoteip);
    if (!ok) return json({ exists: false, error: 'captcha_failed' });

    // 2. Existence check via the service-role-only RPC (parameterized, boolean-only).
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await admin.rpc('account_exists', { p_email: email });
    if (error) {
      console.error('[check-email] account_exists rpc failed', error);
      return json({ exists: false, error: 'internal_error' });
    }
    return json({ exists: data === true });
  } catch (err) {
    console.error('[check-email] unhandled', err);
    return json({ exists: false, error: 'internal_error' });
  }
});
