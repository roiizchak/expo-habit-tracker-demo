# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## SDK version — read this first

`package.json` pins **Expo SDK 54** (`expo@^54.0.0`, `react-native@0.81.5`, `react@19.1.0`). This is intentional: the **Expo Go app on the test phone maxes out at SDK 54**, so the project must stay on 54 to load over Expo Go. `AGENTS.md` links the SDK 56 docs — that is aspirational/stale; trust `package.json` (SDK 54) for the real target. Do not bump the SDK without confirming the phone's Expo Go supports it. Verify any API against the **v54** docs: https://docs.expo.dev/versions/v54.0.0/

## Commands

```bash
npm start              # expo start (Metro bundler + QR)
npx expo start --tunnel  # connect a phone on a different network (uses @expo/ngrok)
npm run android        # open on Android emulator/device
npm run ios            # open on iOS simulator
npm run web            # run in browser
npx tsc --noEmit       # type-check (TS strict; no test/lint/build scripts configured)
```

TypeScript is strict (`tsconfig.json` extends `expo/tsconfig.base` + `strict: true`). There is no test, lint, or build script — `npx tsc --noEmit` is the only static check.

## Architecture

Multi-screen Expo / React Native app (rebuilt from the original single-file demo around a core-function → core-loop → retention-hook product spine). [index.ts](index.ts) is the entry point (`registerRootComponent`); [App.tsx](App.tsx) loads Inter fonts and wraps the tree in `SafeAreaProvider > HabitProvider > FeedbackProvider > RootNavigator`. [app.json](app.json) holds Expo config (`userInterfaceStyle: dark`).

Module layout:
- **theme/** — `tokens.ts` (committed dark identity: near-black bg, signature amber, per-habit color ramp, type scale, spacing/radii/shadow/z), `motion.ts` (reanimated springs + `useReducedMotion` live subscription).
- **lib/** — `types.ts` (data model), `date.ts` (local-date keys + streak/completion/challenge math), `storage.ts` (AsyncStorage + **schema migration**), `challenge.ts` (status reconciliation), `notifications.ts` (local scheduled reminders).
- **store/** — `HabitStore.tsx` (the single source of truth: state, debounced persistence, challenge reconciliation on hydrate/foreground/midnight, all mutations; `applyCount` computes reward results synchronously via refs), `FeedbackProvider.tsx` (owns `useAudioPlayer` — a hook, so it can't live in a plain fn — exposes `useReward()`; reward priority queue challenge > day > habit; confetti + toast overlay).
- **components/** — HabitCard, ProgressRing, ConfettiBurst, Heatmap, WeeklyBars, ui (Screen/Button/Segmented/Stepper).
- **screens/** — Onboarding, Home, Insights, Settings, AddEditHabit, HabitDetail, ChallengeReward (7 screens, surface-area budget).
- **navigation/** — `index.tsx` RootNavigator: `onboarded ? Tabs(Home/Insights/Settings)+modals : Onboarding`; notification-tap routing survives cold start.

Key conventions / gotchas:
- **Persistence + migration.** State persists to AsyncStorage key `@habits/v1`. `lib/storage.ts`'s `normalize()` is the single migration path — it converts the legacy `done: string[]` shape into the current per-day count `log: Record<dateKey, number>`. Keep all hydration changes there.
- **Habit model:** `{ id, name, emoji, color, type: 'binary'|'volume', target, createdAt, log, reminders, notifIds }`. Binary ⇒ `target===1`; volume ⇒ `target>=2`; done-on-day = `count >= target`. Invariants are clamped in the store, never the UI.
- **Date handling:** keys are built manually from `getFullYear/getMonth/getDate` (local time). Do **not** switch to `toISOString` (UTC) — see [lib/date.ts](lib/date.ts).
- **Retention = LOCAL notifications only.** Remote/push is gone from Expo Go on Android since SDK 53; `lib/notifications.ts` schedules DAILY local reminders (works in Expo Go). Don't add push without a dev build.
- **Reward chime** is `assets/sounds/chime.wav`, generated CC0 by `scripts/make-chime.mjs` (re-run to regenerate).
- **babel:** `babel.config.js` uses `babel-preset-expo` only (it auto-configures the reanimated/worklets plugin — do NOT hand-add it). `babel-preset-expo` must stay a top-level dependency or Metro fails to resolve it.
- **deps:** always add native modules with `npx expo install` (not bare npm) so versions match SDK 54; run `npx expo-doctor` after — it caught a wrong-major `expo-asset`/`expo-constants` hoist this session.
