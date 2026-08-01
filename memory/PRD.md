# GroSharey — Product & UI Overhaul PRD

## Original problem statement
Full UI/UX overhaul of GroSharey (React Native + Expo Router + Supabase).
Product is a shared grocery list for households — couples, families, roommates.
The overhaul must preserve every existing feature: Expo Router navigation,
Supabase auth, realtime subscriptions, notification registration, household
invites, receipt uploads, chat, analytics, and shopping-session logic.

## User personas
- **Household owner**: creates the household, invites others, manages lists,
  reviews spending analytics.
- **Household member**: joins via invite code, adds/checks off grocery items,
  chats, uploads receipts, sees shared trip status in realtime.

## Core requirements (static)
1. Preserve existing Expo Router structure and Supabase logic verbatim.
2. TypeScript strict, `npm run validate` passes.
3. Android-first layouts that remain iOS-compatible.
4. Touch targets >= 44 pt, keyboard-safe forms, safe-area everywhere.
5. Consistent spacing, radii, and typography via a single design system.
6. Clear loading, empty, success, and error states on every screen.
7. No emoji as primary UI icons; use a real icon set.
8. Restrained animation — no theatrical motion.

## Design direction
- Aesthetic: **warm & organic** cream backgrounds, soft rounded corners,
  friendly serif accents.
- Font pair: **Fraunces** (display serif) + **Manrope** (UI sans).
- Palette: preserves existing greens (`#173F35`, `#102C25`, `#F4F7F2`) and
  adds a warm cream (`#EDE7D7`) and a restrained terracotta accent (`#B85E3A`).
- Icons: `@expo/vector-icons` — Feather set.

## What's been implemented — 2026-01

### Design system
- `src/theme/index.ts` — colors, spacing, radii, typography scale (display,
  h1/h2/h3, body, caption, eyebrow, button, label, input, mono), shadows,
  and a single Google Font map ready for `useFonts`.
- `app/_layout.tsx` — loads Fraunces + Manrope through `expo-font`, keeps
  the native splash visible until fonts + auth hydrate.

### Reusable UI components (`src/components/ui`)
- `AppScreen` — SafeArea + KeyboardAvoiding + optional scroll wrapper.
- `AppHeader` — eyebrow / title / subtitle / back / right-slot header.
- `PrimaryButton`, `SecondaryButton` — never jump size when toggling
  loading; support icons, sizes and tones.
- `TextField` — labelled input with icon slot, focus/error state, hint,
  and password-visibility toggle for secure fields.
- `SectionHeader` — settings-style group header.
- `EmptyState` — icon medallion + copy + optional action.
- `Panel` — grouped-settings container with warm variant.
- `HouseholdCard` — horizontal-scroll household selector card.
- `GroceryItemRow` — compact checkbox row with quantity/brand/category
  meta chips + notes.
- `StatCard` — analytics tile with dark / warm / light tones.
- `ReceiptCard` — thumbnail + store + total + parse-status pill.
- `MessageBubble` — chat bubble variants for own / others' messages.
- `LoadingState` — inline or full-screen spinner + label.

### Screens overhauled
- **Auth — Sign in / Sign up / Callback / Resend**: real GroSharey brand
  block, distinctive title, password visibility toggle, unified TextField,
  loading state that never resizes the layout, dedicated confirmation
  medallion state on the callback screen.
- **Home**: compact branded header, subtle icon-only sign-out button,
  horizontal household selector using `HouseholdCard`, action card with
  create/join with an OR divider, shared list section, warm empty state.
- **Household management**: back header, three feature tiles (chat / receipts
  / analytics) with real icons, members panel with avatar initials and an
  owner pill, invite creation with prominent Fraunces code, copy + share
  actions on every active invite, list creation, and shared-list list.
- **Grocery list**: shared-list header with progress bar and progress count,
  descriptive "I'm going shopping" CTA (finish variant uses terracotta),
  inline add-item field with add button, grocery rows through the shared
  `GroceryItemRow`, empty state.
- **Chat**: sticky composer with rounded send button, auto-scroll to newest,
  bubbles that only re-show the sender label when the author changes,
  timestamps, keyboard-aware layout.
- **Receipts**: form panel for store + total, native camera capture, receipt
  history uses `ReceiptCard` with thumbnails fetched via signed URLs, tap
  to open a large modal preview.
- **Analytics**: `StatCard` hero + secondary tiles, native progress bars for
  "spend by store" (no chart library), and a "recent spending" activity list.
- **Navigation shell**: `_layout.tsx` sets consistent screen background,
  hides all Expo route names, uses right-slide transitions.

### Behavior preserved (no changes)
- All Supabase queries, RPCs (`create_household`, `accept_household_invite`,
  `create_household_invite`, `start_shopping_session`, `finish_shopping_session`).
- Realtime channels for households, memberships, invites, grocery items,
  shopping sessions, receipts and messages — including cleanup.
- Auth callback token exchange, resend confirmation, session recovery.
- Push notification registration, notification tap navigation, deep links.
- Receipt storage upload path structure and RLS assumptions.

### New dependencies (why)
- `@expo-google-fonts/fraunces` — warm display serif for titles.
- `@expo-google-fonts/manrope` — calm sans for UI/body text.
- `@expo/vector-icons` (now a top-level dep) — Feather icon set to replace
  emoji, and to give TypeScript a resolvable module.
- `expo-clipboard` — copy-to-clipboard for invite codes.

### Non-UI fixes
- `tsconfig.json` now excludes `supabase/functions` (Deno edge functions)
  from `tsc --noEmit`; those files were producing pre-existing type errors
  because the Node TS compiler cannot resolve `Deno` globals or
  `https://esm.sh` module URLs.

## Validation
- `npm install` — passes.
- `npm run validate` — passes (lint + tsc, zero warnings, zero errors).
- `npx expo export --platform web` — bundles successfully; every import,
  font asset, and native module resolves through Metro.

## Backlog / future improvements
- Optional: consolidate list-detail metadata editing (quantity, brand,
  category, notes) into a native modal — data already exists in the schema.
- Optional: add pull-to-refresh on Home + Household Management (data
  currently auto-refreshes via realtime).
- Optional: on-device OCR pipeline for receipts (currently `parse_status`
  remains `pending` until the server-side parser is wired up).
- Optional: skeleton loaders in place of spinners for a more premium feel.

## Not implemented (out of scope this pass)
- No changes to database schemas, migrations, RPCs, RLS, or Supabase edge
  functions.
- No new backend logic. Behavior parity only.
