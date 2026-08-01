# Push notification setup

The mobile app now requests notification permission and stores each Expo push token in `public.device_tokens`.

## 1. Apply the migration

Run `supabase/migrations/20260801083000_invites_notifications_realtime.sql` in the Supabase SQL editor.

This adds realtime membership/invite events, a notification outbox, and database triggers for grocery-item and shopping-session activity.

## 2. Deploy the dispatcher

```bash
npx supabase login
npx supabase link --project-ref lhhfymukogdixptmctjc
npx supabase functions deploy send-push-notifications --no-verify-jwt
```

Supabase automatically supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to hosted Edge Functions.

## 3. Invoke the dispatcher

For testing, invoke it manually after generating an event:

```bash
npx supabase functions invoke send-push-notifications --project-ref lhhfymukogdixptmctjc
```

For ongoing delivery, configure a Supabase Cron job or Database Webhook to invoke `send-push-notifications` regularly. A one-minute cron is enough for the current test build. We can replace polling with a more immediate production dispatcher later.

## 4. Android credentials

Remote Android pushes require an EAS build with valid FCM credentials. Run:

```bash
npx eas-cli credentials --platform android
```

Then create a new preview APK after installing `expo-notifications`.
