# GroSharey

GroSharey is a shared grocery planning and shopping coordination mobile app.

## Current foundation

This branch implements the initial work for:

- **GRO-5** — React Native / Expo mobile project foundation
- **GRO-6** — Android APK build and tester distribution workflow

## Requirements

- Node.js 22
- npm
- Android Studio or a physical Android device
- Expo account and EAS CLI for cloud APK builds

## Local setup

```bash
npm install
npm start
```

Then press `a` to open Android, scan the QR code with Expo Go, or run:

```bash
npm run android
```

## Validation

```bash
npm run validate
```

This runs linting and strict TypeScript checks.

## APK setup

One-time Expo project linking is still required because it creates an Expo-hosted project ID tied to the owner's Expo account:

```bash
npx eas-cli login
npx eas-cli init
```

After `eas init`, confirm that `app.json` contains the generated `extra.eas.projectId`, replacing `REPLACE_AFTER_EAS_INIT`.

Create an internally distributed preview APK with:

```bash
npm run build:apk:preview
```

A development-client APK can be created with:

```bash
npm run build:apk:development
```

The EAS build page provides a direct APK install link and QR code for testers.

## Tester handoff

Each test release should include:

- APK link
- version and environment shown in the app
- notable changes
- areas to test
- known issues

Bug reports should include:

- app version and environment
- device model
- Android version
- exact reproduction steps
- expected and actual result
- screenshot or recording when useful

Use [the tester report template](docs/TESTER_REPORT.md) and [release notes template](docs/RELEASE_NOTES_TEMPLATE.md).

## Environment handling

Public client-side environment values must use the `EXPO_PUBLIC_` prefix. Never commit secrets. Server-side credentials will be configured separately when backend work begins.
