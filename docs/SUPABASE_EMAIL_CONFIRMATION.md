# Supabase mobile email confirmation

GroSharey uses the Expo custom URL scheme configured in `app.json`.

## Supabase dashboard setup

Open **Authentication → URL Configuration** in the Supabase dashboard.

Add this redirect URL:

```text
grosharey://**
```

For local Expo development, the redirect created by `Linking.createURL()` may use an `exp://` URL. Copy the exact redirect shown by the app or Metro logs into the Supabase redirect allow-list when testing through Expo Go.

## Flow

1. Sign-up passes an explicit `emailRedirectTo` value.
2. The email link opens the GroSharey callback route.
3. The callback exchanges a PKCE `code`, or applies the returned access and refresh tokens.
4. Supabase persists the session and the app opens the authenticated home screen.

Old confirmation emails created before this change may still contain the previous broken redirect. Create a fresh test account or resend the confirmation email after updating the redirect allow-list.