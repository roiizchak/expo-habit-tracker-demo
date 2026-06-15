import { defineConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Load .env into process.env (no dotenv dep) so global-setup (Node) gets the same
// EXPO_PUBLIC_* + PW_TEST_* vars Expo inlines into the web build. Existing env wins.
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').replace(/\r$/, '');
    }
  }
}

/**
 * E2E for the AI coaching features, driven against the Expo **web** build.
 * `globalSetup` signs in a seeded test account, marks it onboarded, ensures a
 * habit exists, and seeds `coach_messages` cache rows so the assertions are
 * deterministic and bill no Claude tokens. The `@live` test (opt-in) exercises
 * a real cache-miss -> Claude call.
 *
 * Required env (export before running, or put in .env and export):
 *   EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *   PW_TEST_EMAIL, PW_TEST_PASSWORD  (a pre-confirmed Supabase test account)
 */
const BASE_URL = process.env.PW_BASE_URL || 'http://localhost:8081';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: BASE_URL, trace: 'on-first-retry' },
  grepInvert: process.env.PW_LIVE ? undefined : /@live/,
  webServer: {
    command: 'npm run web',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
