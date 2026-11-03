# QA report — subscription & entitlement system

**Date:** 2026-11-03
**Branch:** `qa/subscription-entitlements` (commit `2bbf6fd`) — **not merged into `main`**
**Base:** `main` @ `9c8aaa4`
**Scope:** subscription model, Stripe integration, RLS/entitlements, receipt-parsing gating,
subscription UI functionality. No UI redesign, no Stripe price changes, nothing deployed.

**Release readiness: CONDITIONAL GO** — see [Conditions](#conditions-for-go).

---

## 1. Area verdicts

| # | Area | Verdict | Basis |
| --- | --- | --- | --- |
| 1 | Subscription model (free solo / $5 / +$2.49 seats) | **PASS** after fixes | 31 assertions executed against the real migrations in a throwaway PostgreSQL 15 container |
| 2 | Stripe integration | **PARTIAL PASS** (code) / **BLOCKED** (account config) | Static audit + fixes. No Stripe API call was made against the GroSharey account; price ids unverifiable from here |
| 3 | Database & permissions | **PASS** after fixes | Migrations applied cleanly in order; RLS and entitlement assertions executed |
| 4 | Receipt-parsing entitlement | **PASS** after fixes | DB gating executed; the OCR/AI code path itself was not run |
| 5 | Subscription UI (functionality) | **PASS** after fixes | Code review + typecheck. Not exercised on a device |
| 6 | Automated QA | **PASS** | `tsc --noEmit` clean, ESLint 0 errors, 31/31 SQL assertions pass |
| 7 | Fixes | **DONE** | 10 defects fixed, 2 left as decisions (below) |

### Not verified — do not read this report as covering them

- **No real payment was processed.** No Checkout session was completed, no card was charged,
  no subscription was created, cancelled or renewed in Stripe.
- **No webhook was delivered.** Signature verification, idempotency and ordering behaviour were
  reviewed and restructured, but never exercised against Stripe's real deliveries.
- **No migration was applied to a deployed Supabase project.** Everything ran against a local
  disposable container.
- **No Deno/Edge Function test ran.** Deno is not installed on this machine, and the repo has no
  JS/TS test runner, so the Edge Function changes are review-verified only.
- **The app was not run.** No emulator or device session.

---

## 2. Defects found

Severity: **S1** breaks the entitlement/billing model, **S2** causes wrong billing or a broken
core flow, **S3** correctness/robustness.

### D1 — S1 — Free households were queued for paid OCR/AI parsing

`queue_receipt_for_parsing` (BEFORE INSERT on `receipts`) unconditionally set
`parse_status := 'pending'` for any receipt with a `storage_path`.
`enforce_receipt_parse_entitlement` from `20260822033000` was supposed to downgrade free
households to `'manual'` — but PostgreSQL fires same-event row triggers **in alphabetical order
by trigger name**, and `enforce_receipt_parse_entitlement` < `queue_receipt_for_parsing`. The
entitlement trigger ran first and was then overwritten.

Net effect: **every image receipt uploaded by a free household entered the paid OCR queue and
was parsed by Google Vision + OpenAI at GroSharey's expense.** This is the headline rule of the
new pricing model and it was not in force.

Reproduction (confirmed against `main`, no fix applied):

```
BASELINE=1 bash supabase/tests/run.sh
# -> ERROR: T3: free receipt must be stored as manual, not queued for paid parsing
```

Direct probe output on the pre-fix schema:

```
receipts BEFORE triggers in fire order:
  enforce_receipt_parse_entitlement -> queue_receipt_for_parsing -> touch_receipts
free household receipt parse_status = pending   (expected: manual)
```

**Fix:** `queue_receipt_for_parsing` now evaluates `household_has_paid_plan()` itself, and the
enforcement trigger is recreated as `zz_enforce_receipt_parse_entitlement` so it is always the
last BEFORE trigger to run. Test **T31** asserts that ordering so the defect cannot silently
return.

### D2 — S1 — A lapsed household's already-queued receipts were still parsed for free

`process-receipts` selected on `parse_status = 'pending'` and performed no entitlement check of
its own. Rows queued while a household was paid stayed queued after cancellation, and the next
cron tick spent OCR + AI budget on them. `20260822033000`'s backfill only cleaned rows that
existed when that migration ran.

**Fix:** `process-receipts` calls `household_has_paid_plan` per receipt and, when unentitled,
moves the row to `'manual'` **before** any paid API call. It fails closed if the entitlement
check itself errors. The hardening migration also re-runs the backfill for rows queued since
`20260822033000` (D1 means there are likely to be some).

### D3 — S2 — Owner could create a second subscription and be charged twice

`create-stripe-checkout` only refused when the *cached* status was `active` or `trialing`. Any
other cached value — `past_due`, `unpaid`, `canceled`, `checkout_pending`, or `inactive` after a
dropped webhook — let the owner open Checkout again and create a second live Stripe
subscription on the same customer.

The UI made this reachable: `household_has_paid_plan()` grants the entitlement during a
cancel-at-period-end grace window (status `canceled`, period end in the future), but the screen
decided purely on `status`, so it showed **"Upgrade & share — $5.00/month"** to a household that
was still entitled and still being billed.

**Fix:** `create-stripe-checkout` reads the subscription back from Stripe and returns 409 when
Stripe reports `trialing | active | past_due | unpaid | incomplete`. The client now shares one
`hasPaidPlan()` helper (`src/lib/billing.ts`) that mirrors the SQL function, grace window
included, so the Upgrade button is not offered to an entitled household.

### D4 — S2 — Concurrent seat sync could create duplicate extra-seat items

`sync-stripe-seats` trusted the cached `stripe_extra_item_id`. Two callers arriving together —
the joining member's post-redeem call plus the household screen's own call, or two members
opening the billing screen — both read `null` and both created an extra-seat subscription item.
Result: the household is billed for the same seats twice, every month.

**Fix:** reconciles against Stripe's live item list rather than the cached id, uses a
deterministic `Idempotency-Key` for item creation so concurrent calls collapse onto one item,
and deletes any duplicate extra-seat items a previous race already created.

### D5 — S2 — No webhook idempotency; unpaid and out-of-order events mishandled

- No event-id ledger: Stripe's at-least-once delivery and retries reprocessed events.
- `checkout.session.completed` wrote `status: 'active'` unconditionally, without checking
  `session.payment_status`. An asynchronous payment method completes the session before the
  money arrives, so a household could be entitled without having paid.
- Because that handler hardcoded `'active'`, a delayed `checkout.session.completed` arriving
  after `customer.subscription.deleted` **resurrected a cancelled subscription**.
- `invoice.payment_failed` / `invoice.paid` were not handled at all.

**Fix:** every handled event now funnels through one `syncSubscription()` that re-reads the
subscription from Stripe and writes Stripe's *current* state — so duplicates and out-of-order
deliveries converge instead of fighting. `checkout.session.completed` requires
`payment_status` of `paid` or `no_payment_required`. Deliveries are de-duplicated through the
new `public.stripe_webhook_events` table (recorded only after successful processing, so
transient failures are still retried). `invoice.*` events are handled.

### D6 — S2 — Paid gate bypassable through the base invite RPC

`20260822033000` added the paid-plan check to `owner_create_household_invite` but left
`public.create_household_invite(uuid)` granted to `authenticated` with only an owner check. A
free owner could call the base RPC directly and mint an invite code.

Confirmed on the pre-fix schema:
`DEFECT CONFIRMED: create_household_invite returned 6AC9120DF0 for a FREE household`

The `enforce_paid_household_sharing` trigger still blocked the *join*, so this was a
defence-in-depth hole rather than free sharing — but the joiner hit a raw database exception.

**Fix:** the paid-plan check now lives in `create_household_invite` itself. Tests T6 and T15
cover both routes, for owners and non-owners.

### D7 — S2 — Returning from Stripe never refreshed billing status

The household screen subscribes to realtime changes on `household_subscriptions`, but that
table was **never added to the `supabase_realtime` publication** (verified: it is absent on
`main`). The webhook's status change was therefore invisible to the client, and after returning
from Checkout the screen still showed "Free plan" until a manual reload.

**Fix:** added to the publication, plus a `useFocusEffect` refresh so a deep-link return that
beats the webhook also re-reads the summary.

### D8 — S3 — Webhook corrupted the cached member count

The subscription handler wrote `active_member_count = 2 + extra_seat_quantity`, i.e. Stripe's
*billing* maths, over the database's real membership count. A paid household with only the
owner displayed "2 active members" on the billing screen.

**Fix:** the webhook writes `extra_seat_count` from Stripe and the real count from
`household_memberships`; `refresh_household_subscription_seats` remains the owner of that
figure.

### D9 — S3 — `current_period_end` could be lost on newer Stripe API versions

Stripe moved `current_period_end` from the subscription to its items in the 2025 API versions,
and neither function pinned a `Stripe-Version`. On a newer account default the field reads
`undefined`, `current_period_end` is stored as `NULL`, and the cancel-at-period-end grace window
in `household_has_paid_plan()` silently stops working (entitlement is revoked immediately on
cancellation).

**Fix:** `periodEndIso()` falls back to the latest `items.data[].current_period_end`. Pinning an
explicit API version on the webhook endpoint is still recommended (see conditions).

### D10 — S3 — Public receipt-processor URL

`process-receipts` is deployed `--no-verify-jwt` for pg_cron, so anyone could POST to it and
force queue runs (it also accepts a `receipt_id`). With D2 fixed the cost exposure is bounded to
genuinely entitled receipts, but the endpoint is still unauthenticated.

**Fix:** optional `PROCESS_RECEIPTS_SECRET` + `x-grosharey-cron-secret` header. Behaviour is
unchanged when the secret is unset; the cron job SQL to add the header is in
`docs/SUBSCRIPTION_BILLING_SETUP.md`.

### D11 — S3 — Non-owners triggered Stripe mutations from the household screen

The seat-sync effect ran for every member on every mount, so a non-owner caused proration-bearing
Stripe quantity changes. **Fix:** owner-only on that screen. The joining member's single
post-redeem reconciliation in `app/index.tsx` is kept deliberately (quantity is always derived
server-side from active memberships, never from the caller).

### D12 — S3 — Simultaneous invite redemptions evaluated a stale entitlement

`accept_household_invite` is itself race-safe (`SELECT … FOR UPDATE` on the invite row; a second
redemption of the same code correctly fails — test T10). But
`enforce_paid_household_sharing` read the entitlement and member count with no serialization.
**Fix:** a per-household `pg_advisory_xact_lock` in the trigger.

---

## 3. Open items — decisions, not defects

### O1 — Lapsed multi-member households keep full data access

`household_has_access()` is referenced by **no RLS policy** — only by
`household_billing_summary` for display, where nothing reads it. So when a shared household's
subscription lapses today:

- AI parsing stops ✅
- new invites are refused ✅
- **existing extra members keep full read/write access to lists, receipts and chat** ❓

That may be exactly right for a beta (locking testers out of their own data is worse than a
little free sharing), but it does not match "paid entitlements revoked when appropriate", so it
should be a conscious decision. I did not change it: adding an RLS lockout is a behaviour change
well beyond a QA pass and could strand testers mid-shop.

Related: `household_has_access()` also changed meaning in `20260822033000`. It used to return
`true` for any household with no subscription row; it now returns
`active_members <= 1 OR paid`. Because nothing enforces it, no existing household lost access —
but anyone who later wires it into a policy should know that a pre-existing multi-member
household with no subscription row evaluates to **false**.

### O2 — `past_due` grants the paid entitlement

Both `household_has_paid_plan()` and the client treat `past_due` as paid, i.e. a full Stripe
dunning cycle (up to ~3 weeks) of free service after a card fails. Deliberate and reasonable;
flagging it so it is not a surprise. `unpaid` correctly does not grant entitlement (test T26).

---

## 4. Files changed

| File | Change |
| --- | --- |
| `supabase/migrations/20261103190000_subscription_entitlement_hardening.sql` | **new** — D1, D6, D7, D12, webhook ledger, backfill |
| `supabase/functions/stripe-webhook/index.ts` | D5, D8, D9 + constant-time signature compare |
| `supabase/functions/create-stripe-checkout/index.ts` | D3 + customer persistence/idempotency + Price-id guard |
| `supabase/functions/sync-stripe-seats/index.ts` | D4 |
| `supabase/functions/process-receipts/index.ts` | D2, D10 |
| `src/lib/billing.ts` | **new** — shared `hasPaidPlan()` mirroring the SQL function |
| `app/household/[id].tsx` | D3 (UI side), D7, D11 |
| `app/household/[id]/receipts.tsx` | uses the shared helper |
| `supabase/tests/*` | **new** — Dockerised migration + entitlement suite |
| `docs/SUBSCRIPTION_BILLING_SETUP.md` | **new** — required Stripe/Supabase configuration |
| `.gitignore` | ignore `supabase/.temp/` |

No Stripe price was created or modified. No secret is committed (`.env` is ignored and holds
only the public Expo keys; a scan of tracked files for `sk_live_`/`sk_test_`/`whsec_` is clean).

---

## 5. Automated test results

```
npx tsc --noEmit        0 errors
npx expo lint           0 errors, 1 warning (pre-existing, analytics.tsx:310, unrelated)
bash supabase/tests/run.sh
  9 migrations applied in order, no errors
  PASS free solo household (T1-T7)
  PASS paid shared household (T8-T15)
  PASS downgrade / cancellation safety (T16-T23)
  PASS subscription status matrix (T24-T26)
  PASS billing privileges and webhook ledger (T27-T28, T30)
  PASS household_subscriptions RLS as authenticated role (T29)
  PASS trigger ordering guard (T31)
  ALL SUBSCRIPTION ENTITLEMENT TESTS PASSED
```

`BASELINE=1 bash supabase/tests/run.sh` (every migration except the fix) **fails at T3**, which
is the suite proving it catches the original defect rather than just agreeing with the new code.

What the 31 assertions cover, negative cases included: free solo pricing and summary fields;
free list creation; free receipt stays `manual`; free user cannot re-queue a receipt; invite
blocked on the free plan through **both** RPC routes; direct membership insert blocked; $5.00 at
two members; $7.49 at three; $9.98 at four; member removal reducing seats and the cached counts;
invite-code reuse refused; non-owner invite creation refused; paid receipts queued; cancel-at-
period-end grace; expired/`unpaid`/`inactive`/`checkout_pending` not entitled; comped and
expired-comp; `past_due`; parsed receipts, line items and totals surviving cancellation; manual
receipt and line-item editing after cancellation; post-lapse uploads staying manual; previously
queued receipts not re-queueable; `household_subscriptions` readable by members and not by
outsiders and writable by no client role; webhook-ledger RLS and duplicate rejection; and the
trigger-ordering guard.

**Coverage gaps:** the repo has no JS/TS test runner, so `src/lib/billing.ts` and the Edge
Functions have no unit tests. Adding Deno's built-in test runner for the pure helpers
(`periodEndIso`, signature verification, `hasPaidPlan`) is the obvious next increment.

---

## 6. Required configuration

Full detail in `docs/SUBSCRIPTION_BILLING_SETUP.md`. The items that need attention before beta:

1. **Verify the price ids — BLOCKED.** `STRIPE_BASE_PRICE_ID` must be a recurring monthly
   **$5.00** Price and `STRIPE_EXTRA_SEAT_PRICE_ID` a recurring monthly **$2.49** Price, both
   `price_…` not `prod_…`. I could not check this: the only Stripe account reachable from this
   session is **"TestFly" (`acct_1UXC00Ld0G3tDin4`, live mode)**, which is not GroSharey — its
   only active price is a single $9.00/month recurring price. Confirm the GroSharey account's
   two price ids by hand. The new guard in `create-stripe-checkout` catches a `prod_` id but
   cannot catch a wrong amount.
2. **Webhook events.** Subscribe the endpoint to `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `customer.subscription.created|updated|deleted`,
   `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`.
3. **Pin the webhook endpoint's API version** in the Stripe dashboard (see D9) so
   `current_period_end` does not move underneath the handler.
4. **Keep the four Stripe secrets in the same mode.** A live `STRIPE_SECRET_KEY` with a test
   `STRIPE_WEBHOOK_SECRET` makes every signature check fail and leaves households stuck in
   `checkout_pending`.
5. **Enable the Stripe Customer Portal** with cancellation and payment-method updates.
6. Optional: set `PROCESS_RECEIPTS_SECRET` and re-schedule the cron job with the matching
   header (SQL in the setup doc).

---

## 7. Deployment steps

```
# 1. database (staging first)
supabase db push          # applies 20261103190000_subscription_entitlement_hardening.sql

# 2. edge functions
supabase functions deploy create-stripe-checkout
supabase functions deploy sync-stripe-seats
supabase functions deploy stripe-webhook   --no-verify-jwt
supabase functions deploy process-receipts --no-verify-jwt
```

The migration is forward-only and idempotent-ish (`create or replace`, `if not exists`,
`drop trigger if exists`). It performs **one data change**: unpaid households' receipts with
`parse_status in ('pending','processing')` are moved to `'manual'`. That is the intended cleanup
of D1's backlog, it deletes nothing, and it leaves already-parsed receipts untouched (tests
T19–T21). Take the usual snapshot first anyway.

`create-stripe-portal` and `stripe-return` are unchanged and need no redeploy.

**Nothing has been deployed or pushed. `main` is untouched.**

## 8. New Android APK?

**Not strictly required — an OTA update is enough.** The client changes are JavaScript only
(`app/household/[id].tsx`, `app/household/[id]/receipts.tsx`, new `src/lib/billing.ts`); no
native module, permission or config-plugin changed, so the runtime version is unaffected and
`eas update` will reach existing preview builds.

Cut a fresh `preview` APK instead if testers are on a build older than the current runtime, or
if you would rather hand them a single clean artifact for the beta. Either way the **database
migration and Edge Function deploys must land first** — an updated client against the old
backend will still show stale billing status after Checkout.

## 9. Release readiness: CONDITIONAL GO

The model is sound and, with this branch, enforced in the right place — in the database, with
the Edge Functions and client as agreeing layers rather than the only gate. Free households can
no longer spend OCR/AI budget, the double-charge path is closed, and webhook handling is now
idempotent and order-independent.

### Conditions for GO

1. **Verify the two Stripe price ids and amounts by hand** (§6.1). Unverifiable from here, and
   wrong by a cent is wrong on every invoice.
2. **Run one end-to-end test-mode cycle** with the Stripe CLI against a staging project:
   checkout → webhook → `status = active` → invite + join → seat quantity goes to 1 extra →
   remove a member → quantity back to 0 → cancel in the Portal → entitlement behaviour at and
   after period end. Replay a duplicate and an out-of-order delivery
   (`stripe events resend`) — the ledger and the re-read are new and have never seen Stripe.
3. **Confirm a failed payment** (`4000 0000 0000 0341`) lands the household in `past_due` and
   that the dunning grace in O2 is what you want.
4. **Decide O1** — whether a lapsed shared household should lose data access. Leaving it as-is
   is a defensible beta answer, but make it a decision.
5. **Walk the UI once on a device**: free-plan copy, Upgrade → Checkout, deep-link return
   refreshing to "Shared", abandoning Checkout (household should sit at `checkout_pending` and
   the Upgrade button must still work), non-owner seeing "Billing is managed by the household
   owner", and a free account's receipt showing "Stored without AI parsing".

With 1–3 and 5 green, this is a **GO** for 7–8 external testers. Until a real Stripe cycle has
run against a deployed project, it is not.
