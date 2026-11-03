# Subscription & billing setup

GroSharey's entitlement model:

| Household | Price |
| --- | --- |
| One person | Free forever |
| Owner + 1 member | $5.00/month |
| Each additional active member | +$2.49/month |

Free households can create lists, upload receipts and enter store/total manually. **Sharing
(invites) and AI/OCR receipt parsing are paid features.** Only the household owner pays and
only the owner can create invite codes.

## 1. Stripe products and prices

Create two **recurring monthly Prices** in the GroSharey Stripe account (one Product each is
fine):

| Purpose | Amount | Env var |
| --- | --- | --- |
| Base plan (owner + 1 member) | $5.00 / month | `STRIPE_BASE_PRICE_ID` |
| Additional active member seat | $2.49 / month | `STRIPE_EXTRA_SEAT_PRICE_ID` |

Both values must be **Price** ids (`price_...`), not Product ids (`prod_...`).
`create-stripe-checkout` rejects the request with a clear error if a `prod_` id is configured.

Do not change these prices once testers are subscribed — Stripe applies price changes to
existing subscriptions at renewal.

## 2. Edge Function secrets

Set on the Supabase project (`supabase secrets set KEY=value`):

| Secret | Used by | Notes |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | checkout, portal, seats, webhook | `sk_test_...` for the test project, `sk_live_...` for production. Never commit it. |
| `STRIPE_WEBHOOK_SECRET` | webhook | `whsec_...` from the webhook endpoint you create in step 3. Test and live endpoints have **different** secrets. |
| `STRIPE_BASE_PRICE_ID` | checkout, webhook | See step 1. Test-mode and live-mode price ids differ. |
| `STRIPE_EXTRA_SEAT_PRICE_ID` | checkout, seats, webhook | See step 1. |
| `GOOGLE_VISION_API_KEY` | process-receipts | OCR. |
| `OPENAI_API_KEY` | process-receipts | Line-item parsing. |
| `OPENAI_RECEIPT_MODEL` | process-receipts | Optional; defaults to `gpt-5-mini`. |
| `PROCESS_RECEIPTS_SECRET` | process-receipts | Optional. See step 5. |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform.

**Test vs live:** keep one Supabase project per Stripe mode, or swap all four Stripe secrets
together. A live `STRIPE_SECRET_KEY` paired with a test `STRIPE_WEBHOOK_SECRET` silently
rejects every webhook (the signature never verifies) and households stay `checkout_pending`.

## 3. Webhook endpoint

Endpoint URL: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`

Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

Deploy it without JWT verification — Stripe signs the request instead:

```
supabase functions deploy stripe-webhook --no-verify-jwt
```

The handler verifies the `stripe-signature` HMAC (rejecting anything older than 5 minutes),
de-duplicates deliveries through `public.stripe_webhook_events`, and re-reads the subscription
from Stripe rather than trusting the status in the event body — so duplicate and out-of-order
deliveries converge on Stripe's current state.

## 4. Function deployment

```
supabase functions deploy create-stripe-checkout
supabase functions deploy create-stripe-portal
supabase functions deploy sync-stripe-seats
supabase functions deploy stripe-webhook   --no-verify-jwt
supabase functions deploy process-receipts --no-verify-jwt
```

`stripe-return` serves the post-Checkout landing page and deep-links back into the app:

```
supabase functions deploy stripe-return --no-verify-jwt
```

## 5. Receipt processor cron

`process-receipts` is driven by the `grosharey-process-receipts` pg_cron job once a minute and
is deployed `--no-verify-jwt` so pg_cron can reach it. It only ever touches receipts already
queued in the database, and it re-checks `household_has_paid_plan()` for every receipt before
spending an OCR or AI call.

Because the URL is public, set `PROCESS_RECEIPTS_SECRET` and add the matching header to the
cron job so nobody else can drive the queue:

```sql
select cron.unschedule('grosharey-process-receipts');
select cron.schedule('grosharey-process-receipts', '* * * * *', $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/process-receipts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-grosharey-cron-secret', '<the same value as PROCESS_RECEIPTS_SECRET>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$$);
```

Leave `PROCESS_RECEIPTS_SECRET` unset to keep the previous behaviour.

## 6. Customer Portal

Enable the Stripe Customer Portal (Settings → Billing → Customer portal) with cancellation and
payment-method updates allowed. `create-stripe-portal` is owner-only and reuses the household's
stored `stripe_customer_id`.

## 7. Verifying the database rules

The entitlement rules live in the database, not just the client. Run them against a throwaway
PostgreSQL container:

```
bash supabase/tests/run.sh
```

`BASELINE=1 bash supabase/tests/run.sh` applies every migration *except* the QA hardening one,
which should fail — that is the suite proving it still catches the original defects.
