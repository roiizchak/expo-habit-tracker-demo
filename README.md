# Habit Tracker

A polished, **offline-first habit tracker** built with Expo SDK 54 and React Native. Track binary and volume-based habits, keep streaks alive, hit weekly challenges, and get rewarded with confetti, a chime, and haptics — all running locally on your phone with no account and no backend.

> An example app showing a complete product spine — core function → core loop → retention hook — implemented in a real, multi-screen Expo app.

## Features

- **Two habit types** — *binary* (done / not done) and *volume* (count toward a daily target, e.g. "drink 8 glasses").
- **Streaks & per-day counts** — local-date streak math; a day counts as done when `count >= target`.
- **Insights** — calendar **heatmap** and **weekly bars** to visualize consistency over time.
- **Challenges + rewards** — complete a challenge and get a layered reward: **confetti burst + chime + haptics**, with a priority queue (challenge > day > habit).
- **Local daily reminders** — scheduled local notifications that work in Expo Go (no push server, no dev build needed).
- **Dark-first themed UI** — near-black background, signature amber accent, and a per-habit color ramp; honors *reduce motion*.
- **Durable persistence** — state is saved to AsyncStorage with a built-in schema migration path.

## Screenshots

> 📸 _Coming soon._ Drop device captures into `assets/screenshots/` and link them here.

## Tech stack

- **Expo SDK 54** · **React Native 0.81** · **React 19**
- **TypeScript** (strict mode)
- **React Navigation 7** (bottom tabs + native stack)
- **React Native Reanimated 4** (springs, reduce-motion aware)
- **expo-audio** (reward chime) · **expo-haptics** · **expo-notifications** (local reminders)
- **AsyncStorage** for persistence · **react-native-svg** for charts/rings

## Getting started

> **Expo Go requirement:** this project pins **Expo SDK 54** because the Expo Go app used for testing maxes out at SDK 54. Make sure your Expo Go app supports SDK 54. Don't bump the SDK without confirming your device supports it.

```bash
git clone https://github.com/roiizchak/expo-habit-tracker-demo.git
cd expo-habit-tracker-demo
npm install
npm start            # starts Metro + prints a QR code
```

Scan the QR code with **Expo Go** (Android) or the Camera app (iOS). If your phone is on a different network than your computer:

```bash
npx expo start --tunnel   # routes through @expo/ngrok
```

Other run targets:

```bash
npm run android   # open on an Android emulator/device
npm run ios       # open on an iOS simulator
npm run web       # run in the browser
```

## Project structure

```
theme/        Design tokens (colors, type scale, spacing) + motion/springs
lib/          Data model, local-date + streak math, AsyncStorage + migration,
              challenge reconciliation, local notifications
store/        HabitStore (single source of truth) + FeedbackProvider (rewards)
components/   HabitCard, ProgressRing, ConfettiBurst, Heatmap, WeeklyBars, ui/
screens/      Onboarding, Home, Insights, Settings, AddEditHabit, HabitDetail,
              ChallengeReward
navigation/   RootNavigator (tabs + modals; notification-tap routing)
App.tsx       Loads fonts, wraps tree in providers + RootNavigator
index.ts      Entry point (registerRootComponent)
```

See [CLAUDE.md](CLAUDE.md) for deeper architecture notes and gotchas (persistence/migration, local-time date keys, local-only notifications).

## Type-check

There is no test/lint/build script — the single static check is:

```bash
npx tsc --noEmit
```

## License

[MIT](LICENSE) © Roi Izchak
