# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## SDK version — read this first

`package.json` pins **Expo SDK 54** (`expo@^54.0.0`, `react-native@0.81.5`, `react@19.1.0`). This is intentional: the **Expo Go app on the test phone maxes out at SDK 54**, so the project must stay on 54 to load over Expo Go. Do not bump the SDK without confirming the phone's Expo Go supports it. Verify any API against the **v54** docs: https://docs.expo.dev/versions/v54.0.0/

## Commands

```bash
npm start              # expo start (Metro bundler + QR)
npx expo start --tunnel  # connect a phone on a different network (uses @expo/ngrok)
npm run android        # open on Android emulator/device
npm run ios            # open on iOS simulator
npm run web            # run in browser
npx tsc --noEmit       # type-check (TS strict; no test/lint/build scripts configured)

npx supabase db push           # apply supabase/migrations/*.sql to the cloud DB
npx supabase db query --linked # query the linked remote DB (the --linked flag is required)
npx supabase functions deploy ai-coach   # deploy the AI coaching Edge Function
npx supabase secrets set ANTHROPIC_API_KEY=<key>   # set the Claude key the function reads

npm run test:e2e       # Playwright E2E (Expo web build) — see the AI coaching gotcha for env
npx playwright test e2e/coach.spec.ts            # run a single spec file
npx playwright test e2e/coach.spec.ts -g "nudge" # run one test by title (grep)
```

TypeScript is strict (`tsconfig.json` extends `expo/tsconfig.base` + `strict: true`). There is no test, lint, or build script — `npx tsc --noEmit` is the only static check.

## Architecture

Multi-screen Expo / React Native app (rebuilt from the original single-file demo around a core-function → core-loop → retention-hook product spine). Local-first UI backed by a **Supabase** per-user store (auth + offline-first sync). [index.ts](index.ts) is the entry point (`registerRootComponent`); [App.tsx](App.tsx) loads Inter fonts and wraps the tree in `SafeAreaProvider > AuthProvider > HabitProvider > FeedbackProvider > RootNavigator` (AuthProvider is above HabitProvider so the store can scope its cache + sync to `userId`). [app.json](app.json) holds Expo config (`userInterfaceStyle: dark`).

Module layout:
- **theme/** — `tokens.ts` (committed dark identity: near-black bg, signature amber, per-habit color ramp, type scale, spacing/radii/shadow/z), `motion.ts` (reanimated springs + `useReducedMotion` live subscription).
- **lib/** — `types.ts` (data model + `SyncOp` union), `date.ts` (local-date keys + streak/completion/challenge math), `storage.ts` (AsyncStorage + **schema migration**), `challenge.ts` (status reconciliation), `notifications.ts` (local scheduled reminders), `supabase.ts` (RN Supabase client: AsyncStorage-backed session, AppState-driven token refresh), `sync.ts` (`flushDirty`/`pullDelta` — row↔domain mappers, never throws to caller), `coach.ts` (AI coaching client: invokes the `ai-coach` Edge Function + local AsyncStorage cache under `@coach/v1/<userId>`).
- **store/** — `HabitStore.tsx` (the single source of truth: state, debounced persistence, challenge reconciliation on hydrate/foreground/midnight, all mutations + **Supabase sync**; `applyCount` computes reward results synchronously via refs), `AuthProvider.tsx` (owns the Supabase session; email/password + OTP confirm + Google OAuth; exposes `useAuth()`), `FeedbackProvider.tsx` (owns `useAudioPlayer` — a hook, so it can't live in a plain fn — exposes `useReward()`; reward priority queue challenge > day > habit; confetti + toast overlay).
- **components/** — HabitCard, ProgressRing, ConfettiBurst, Heatmap, WeeklyBars, CoachCard (AI coaching surface), ui (Screen/Button/Segmented/Stepper).
- **screens/** — Auth, Onboarding, Home, Insights, Settings, AddEditHabit, HabitDetail, ChallengeReward, ChangePassword (9 screens, surface-area budget). Home renders the auto coaching nudge; Insights (charts tab) renders the manual weekly/monthly AI reflection. `ChangePasswordScreen` double-duties as the in-app change-password modal AND the forced recovery set-password screen (`recovery: true` param).
- **navigation/** — `index.tsx` RootNavigator gates on auth → forced-recovery → onboarding: `!session ? Auth : recoveryNeedsPassword ? ChangePassword(recovery) : !onboarded ? Onboarding : Tabs(Home/Insights/Settings)+modals`; the recovery gate has `gestureEnabled:false` (can't be swiped away); notification-tap routing survives cold start; flushes pending sync on onboard.
- **supabase/** — `migrations/*.sql` (per-user normalized schema: profiles/settings/habits/challenges/daily_logs + `coach_messages` AI cache + `account_exists(email)` RPC), `functions/ai-coach/` (Deno Edge Function → Claude API), `config.toml`. Project ref lives in `.supabase-create.txt` (gitignored).
- **e2e/** — Playwright suite (`coach.spec.ts` + `global-setup.ts`) driving the Expo **web** build; `playwright.config.ts` boots `npm run web`.

Key conventions / gotchas:
- **Persistence + migration.** State persists to AsyncStorage key `@habits/v1`. `lib/storage.ts`'s `normalize()` is the single migration path — it converts the legacy `done: string[]` shape into the current per-day count `log: Record<dateKey, number>`. Keep all hydration changes there.
- **Sync model = offline-first, local-authoritative.** AsyncStorage is the UI's source of truth; Supabase is the durable per-user store. Every mutation writes local state immediately AND enqueues a self-contained `SyncOp` in `pending` (persisted, survives kill). A debounced `flushDirty` pushes ops; confirmed ops are dropped **by object identity, not by key** (a newer same-key op enqueued mid-flush must survive). On login + foreground, `pullDelta(since)` merges a remote delta letting still-pending local ops win (last-write-wins). All state is scoped to `userId`; sign-out clears it. `sync.ts` swallows network errors to a no-op so the app stays usable offline.
- **Remote schema gotchas** (see the migration SQL): tables carry a denormalized `user_id` for flat RLS (`auth.uid() = user_id`, no joins); `id`s are client-generated UUID **strings** (offline-first identity); habits/challenges/daily_logs use composite PK `(user_id, id)` and composite FKs so a child can only attach to a habit the *same* user owns (cross-user injection guard); `deleted_at` **tombstones** drive delta-pull (hard deletes are invisible remotely — soft-delete a habit AND tombstone its children, the FK cascade only fires on hard delete); `updated_at` is server-set by trigger (never trust client clocks). `notifIds` is local-only and intentionally **never synced**.
- **Auth in Expo Go.** Email/password + 6-digit OTP confirm (mobile-safe, no redirect) + Google OAuth via the `expo-web-browser` redirect flow (`AuthProvider` handles both PKCE `code` and implicit fragment tokens). The Supabase **publishable** key is public by design — security rests on RLS, never ship the service_role key.
- **Password reset / change / recovery** (`store/AuthProvider.tsx`). All in `AuthProvider`, both flows reuse the **6-digit OTP** convention (mobile-safe, no redirect):
  - **Forgot password (logged out):** `checkEmailExists` → `sendPasswordReset` → `verifyPasswordResetOtp(email, code, newPassword)`. The recovery email must use the **"Reset Password"** template sending `{{ .Token }}` (a code), NOT the default `{{ .ConfirmationURL }}` link. `verifyOtp(type:'recovery')` creates a live session on success, which makes RootNavigator unmount the Auth screen — so the password update **must happen in the same call**, before resolving, or the user lands in-app with the old password. If verify succeeds but `updateUser` fails, the user holds a live recovery session with an unchanged password: `recoveryNeedsPassword` is raised (persisted to `@auth/recoveryNeedsPassword`, restored **before** the splash lifts on cold start, `gestureEnabled:false`) and `retryPasswordUpdate` finishes without re-entering the code. Cleared on sign-out / no-session init.
  - **`account_exists(email)` RPC** (`SECURITY DEFINER`, `search_path=''`): the forgot-password screen calls it to **block recovery for unregistered emails** — anon can't read `auth.users` and `resetPasswordForEmail` is silent by design. It's a **deliberate user-enumeration surface** (returns only a boolean, no throttle in v1 — CAPTCHA/rate-limit is a documented follow-up); do not widen its output. A non-null `error` from `checkEmailExists` (offline) must NOT be treated as "no account" — only `exists===false` means that.
  - **Change password (logged in):** `changePassword` **re-authenticates** via `signInWithPassword` first (enforcing the current-password check ourselves — GoTrue only validates `updateUser`'s `current_password` when `REQUIRE_CURRENT_PASSWORD` is enabled server-side). Only `code==='invalid_credentials'` means "incorrect"; transient errors pass through. `hasPasswordIdentity()` hides the option for Google-only users (no password).
- **Env.** `lib/supabase.ts` reads `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (inlined at build by Expo; see `.env.example`). Missing env logs loudly and leaves the app with no backend.
- **Habit model:** `{ id, name, emoji, color, type: 'binary'|'volume', target, createdAt, log, reminders, notifIds }`. Binary ⇒ `target===1`; volume ⇒ `target>=2`; done-on-day = `count >= target`. Invariants are clamped in the store, never the UI.
- **Date handling:** keys are built manually from `getFullYear/getMonth/getDate` (local time). Do **not** switch to `toISOString` (UTC) — see [lib/date.ts](lib/date.ts).
- **Retention = LOCAL notifications only.** Remote/push is gone from Expo Go on Android since SDK 53; `lib/notifications.ts` schedules DAILY local reminders (works in Expo Go). Don't add push without a dev build.
- **Reward chime** is `assets/sounds/chime.wav`, generated CC0 by `scripts/make-chime.mjs` (re-run to regenerate).
- **babel:** `babel.config.js` uses `babel-preset-expo` only (it auto-configures the reanimated/worklets plugin — do NOT hand-add it). `babel-preset-expo` must stay a top-level dependency or Metro fails to resolve it.
- **deps:** always add native modules with `npx expo install` (not bare npm) so versions match SDK 54; run `npx expo-doctor` after — it caught a wrong-major `expo-asset`/`expo-constants` hoist this session.
- **AI coaching (Claude backend via Edge Function).** Two features: an auto **nudge** on Home and a manual weekly/monthly **reflection** on Insights. Flow = Mobile → `supabase/functions/ai-coach` (Deno) → Claude API (`claude-sonnet-4-6`). The function forwards the caller's JWT to a user-scoped client so **RLS** applies, reads `habits`/`daily_logs`, reduces them to compact stats (streak/best/rate7/rate30 + weekday pattern), calls Claude, and caches in `coach_messages`. Cost guards: `period_key` is computed **server-side** from the client's IANA timezone (never trusted from the client); per-`(user,kind)` daily rate limit; an `is_pending` sentinel row reserves the slot so two simultaneous cache-misses don't both bill. The handler never throws (mirrors `sync.ts`) — failures return `{ text: null, error }`. Secret `ANTHROPIC_API_KEY` lives only in Edge Function secrets, never in the client. `lib/coach.ts` wraps invocation + a local AsyncStorage cache (`@coach/v1/<userId>`) so content shows offline; it is **not** wired into the `pending` sync queue. The coaching gate is `ready && onboarded && session && habits.length > 0` — no Claude call mid-onboarding. Anthropic SDK is pinned (`npm:@anthropic-ai/sdk@0.104.1`) in the Deno import; `supabase/functions` is excluded from the app `tsconfig`.
- **`coach_messages` table.** PK `(user_id, kind, period_key)`; nullable `content` + `is_pending` for the sentinel; same flat-RLS + `set_updated_at` conventions as the rest of the schema. Written only by the Edge Function. `period_key`: nudge = `'YYYY-MM-DD'`, reflection = `'YYYY-Www'` (ISO week) or `'YYYY-MM'`.
- **E2E env.** `npm run test:e2e` needs `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and a **pre-confirmed** `PW_TEST_EMAIL` / `PW_TEST_PASSWORD` account exported in the env. `global-setup` signs in and ensures the account is onboarded with a habit, then writes the session to `e2e/.auth.json`; the spec injects it into the web build's `localStorage` (`sb-<ref>-auth-token`) so it boots authenticated. The default specs **intercept** the `ai-coach` call (`page.route`) and return canned text — deterministic, hermetic, no Claude tokens. The `@live` spec (`PW_LIVE=1`) lets the call through to the real deployed function. No service-role key is needed (the function owns `coach_messages` writes server-side).
