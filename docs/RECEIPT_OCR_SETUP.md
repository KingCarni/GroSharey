# GroSharey receipt OCR setup

GroSharey receipt processing uses Google Cloud Vision for OCR and OpenAI for structured receipt parsing.

## 1. Google Cloud Vision

1. Create/select a Google Cloud project.
2. Enable **Cloud Vision API**.
3. Create an API key restricted to the Cloud Vision API.
4. Keep the key server-side only.

## 2. OpenAI

Create an OpenAI API key for the receipt parser. The Edge Function defaults to `gpt-5-mini`; set `OPENAI_RECEIPT_MODEL` if a different supported structured-output model is desired.

## 3. Set Supabase Edge Function secrets

From the GroSharey project directory:

```powershell
npx supabase secrets set GOOGLE_VISION_API_KEY="YOUR_GOOGLE_KEY"
npx supabase secrets set OPENAI_API_KEY="YOUR_OPENAI_KEY"
npx supabase secrets set OPENAI_RECEIPT_MODEL="gpt-5-mini"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by the hosted Edge Function environment.

## 4. Apply migrations

Run these in order in Supabase SQL Editor (or with your normal migration workflow):

- `supabase/migrations/20260808001500_receipt_ocr_pipeline.sql`
- `supabase/migrations/20260808002000_receipt_processor_cron.sql`

The first migration creates `receipt_items`, parse metadata, and receipt-linked price observations. It also ensures every newly uploaded image-backed receipt is queued for OCR.

The second migration schedules the processor once per minute using Supabase Cron/pg_net.

## 5. Deploy the processor

```powershell
npx supabase functions deploy process-receipts --no-verify-jwt
```

## 6. Test manually

Upload a new receipt in GroSharey. It should move through:

`Queued for parsing` -> `Reading receipt...` -> `Receipt parsed`

The cron can take up to about one minute to start processing.

You can force an immediate test with:

```powershell
npx supabase functions invoke process-receipts --no-verify-jwt
```

After a successful parse, inspect:

- `receipts.raw_text`
- `receipts.store_name`, totals, date, confidence
- `receipt_items`
- `price_observations`

## Privacy / community pricing

Parsed price observations are created with `is_community_eligible = false`. Do not turn on cross-household/community price sharing until explicit user consent and location/privacy rules are implemented.
