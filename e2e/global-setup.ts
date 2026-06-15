/**
 * Playwright global setup: sign in the seeded test account (supabase-js, Node) and
 * make sure it is onboarded with at least one habit (so the coaching gate passes).
 * The captured session is written to e2e/.auth.json; the spec injects it into the
 * web app's localStorage so the app boots already authenticated.
 *
 * No coach_messages seeding here — the deterministic specs intercept the `ai-coach`
 * function call in the browser (Playwright `page.route`), so they need neither the
 * service-role key nor a real Claude call. The `@live` spec lets the call through.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

export default async function globalSetup(): Promise<void> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.PW_TEST_EMAIL;
  const password = process.env.PW_TEST_PASSWORD;
  if (!url || !key || !email || !password) {
    throw new Error(
      'E2E setup needs EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, ' +
        'PW_TEST_EMAIL and PW_TEST_PASSWORD (a pre-confirmed Supabase account).',
    );
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    throw new Error(`E2E sign-in failed: ${error?.message ?? 'no session'}`);
  }
  const userId = data.user.id;
  const today = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  // Onboarded + a habit so the coaching gate (ready && onboarded && habits>0) passes.
  // profiles/habits stay client-writable under their own RLS (unlike coach_messages).
  await supabase.from('profiles').upsert({ id: userId, onboarded: true });
  await supabase
    .from('habits')
    .upsert(
      {
        id: 'e2e-habit',
        user_id: userId,
        name: 'E2E Habit',
        emoji: '✅',
        color: '#F5B53D',
        type: 'binary',
        target: 1,
        created_at_key: today,
        deleted_at: null,
      },
      { onConflict: 'user_id,id' },
    );

  const ref = new URL(url).hostname.split('.')[0];
  fs.writeFileSync(
    path.join(__dirname, '.auth.json'),
    JSON.stringify({ ref, session: data.session, userId }, null, 2),
  );
}
