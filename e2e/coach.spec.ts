/**
 * E2E for the AI coaching features against the Expo web build.
 *
 * Auth is injected via localStorage (the session captured in global-setup), so the
 * app boots straight to the Tabs. The default specs INTERCEPT the `ai-coach`
 * Edge Function call (Playwright `page.route`) and return canned text, so they are
 * deterministic, hermetic, and bill no Claude tokens. The `@live` spec lets the
 * call through to exercise the real Claude round-trip (run with PW_LIVE=1).
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const auth = JSON.parse(fs.readFileSync(path.join(__dirname, '.auth.json'), 'utf8')) as {
  ref: string;
  session: unknown;
  userId: string;
};

const storageKey = `sb-${auth.ref}-auth-token`;

const SEED = {
  nudge: '[E2E] You are on a roll — keep your streak alive today!',
  week: '[E2E] Weekly recap: your consistency held strong this week.',
  month: '[E2E] Monthly recap: steady, encouraging progress overall.',
};

/** Intercept the Edge Function and answer with deterministic canned text. */
async function stubCoach(page: Page) {
  await page.route('**/functions/v1/ai-coach', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const text =
      body.kind === 'nudge'
        ? SEED.nudge
        : body.period === 'month'
          ? SEED.month
          : SEED.week;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text, kind: body.kind, cached: false }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  // Seed the supabase-js session into localStorage before any app code runs.
  await page.addInitScript(
    ([k, v]) => window.localStorage.setItem(k, v),
    [storageKey, JSON.stringify(auth.session)] as const,
  );
});

test('Home shows the AI coaching nudge', async ({ page }) => {
  await stubCoach(page);
  await page.goto('/');
  const nudge = page.getByTestId('coach-nudge');
  await expect(nudge).toBeVisible();
  await expect(nudge).toHaveText(SEED.nudge);
});

test('Insights generates weekly and monthly reflections', async ({ page }) => {
  await stubCoach(page);
  await page.goto('/');

  // Switch to the Insights tab (route name is the accessible tab name).
  await page.getByRole('tab', { name: /insights/i }).click();

  const reflection = page.getByTestId('coach-reflection');
  await expect(reflection).toBeVisible();

  // Week (default segment) -> Generate -> weekly text.
  await page.getByTestId('coach-generate').click();
  await expect(reflection).toHaveText(SEED.week);

  // Month segment -> Generate -> monthly text.
  await page.getByText('Month', { exact: true }).click();
  await page.getByTestId('coach-generate').click();
  await expect(reflection).toHaveText(SEED.month);
});

test('@live real nudge round-trips through Claude', async ({ page }) => {
  // No stub: the app calls the deployed Edge Function -> Claude. Asserts that a
  // non-empty nudge renders (content is non-deterministic).
  await page.goto('/');
  const nudge = page.getByTestId('coach-nudge');
  await expect(nudge).toBeVisible();
  await expect
    .poll(async () => ((await nudge.textContent()) ?? '').trim().length, { timeout: 30_000 })
    .toBeGreaterThan(0);
});
