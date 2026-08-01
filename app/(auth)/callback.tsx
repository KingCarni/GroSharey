import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { AppScreen, PrimaryButton } from '../../src/components/ui';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, type } from '../../src/theme';

type AuthValues = {
  code: string | null;
  tokenHash: string | null;
  type: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  errorDescription: string | null;
};

function firstString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function getAuthValues(url: string): AuthValues {
  const normalized = url.replace('#', '?');
  const parsed = new URL(normalized);

  return {
    code: parsed.searchParams.get('code'),
    tokenHash: parsed.searchParams.get('token_hash'),
    type: parsed.searchParams.get('type'),
    accessToken: parsed.searchParams.get('access_token'),
    refreshToken: parsed.searchParams.get('refresh_token'),
    errorDescription: parsed.searchParams.get('error_description'),
  };
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const liveUrl = Linking.useURL();
  const params = useLocalSearchParams<{
    code?: string | string[];
    token_hash?: string | string[];
    type?: string | string[];
    access_token?: string | string[];
    refresh_token?: string | string[];
    error_description?: string | string[];
  }>();
  const [message, setMessage] = useState('Verifying your email…');
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;

    async function finishConfirmation() {
      try {
        const initialUrl = liveUrl ?? await Linking.getInitialURL();
        const urlValues = initialUrl ? getAuthValues(initialUrl) : null;

        const code = firstString(params.code) ?? urlValues?.code ?? null;
        const tokenHash = firstString(params.token_hash) ?? urlValues?.tokenHash ?? null;
        const confirmationType = firstString(params.type) ?? urlValues?.type ?? 'email';
        const accessToken = firstString(params.access_token) ?? urlValues?.accessToken ?? null;
        const refreshToken = firstString(params.refresh_token) ?? urlValues?.refreshToken ?? null;
        const errorDescription = firstString(params.error_description) ?? urlValues?.errorDescription ?? null;

        if (errorDescription) throw new Error(decodeURIComponent(errorDescription));

        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: confirmationType === 'signup' ? 'email' : confirmationType as 'email',
          });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else {
          // Supabase may have completed confirmation before Android hands the app
          // the redirect. Accept an already-persisted session before reporting failure.
          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;
          if (!data.session) {
            throw new Error('The confirmation link did not include a supported authentication token. Request a new confirmation email and use the newest link.');
          }
        }

        if (!active) return;
        setDone(true);
        setMessage('Email confirmed. Opening GroSharey…');
        setTimeout(() => {
          if (active) router.replace('/');
        }, 500);
      } catch (error) {
        if (!active) return;
        setFailed(true);
        setMessage(error instanceof Error ? error.message : 'Email confirmation failed.');
      }
    }

    const timeout = setTimeout(() => {
      if (!active) return;
      setFailed(true);
      setMessage('Confirmation timed out. Return to sign up, resend the confirmation email, and use the newest link.');
    }, 15000);

    void finishConfirmation().finally(() => clearTimeout(timeout));

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [
    liveUrl,
    params.access_token,
    params.code,
    params.error_description,
    params.refresh_token,
    params.token_hash,
    params.type,
    router,
  ]);

  return (
    <AppScreen padded={false}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <Image
          source={require('../../Assets/Logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View
          style={[
            styles.medallion,
            failed && styles.medallionError,
            done && styles.medallionDone,
          ]}
        >
          {failed ? (
            <Feather name="alert-triangle" size={24} color={colors.danger} />
          ) : done ? (
            <Feather name="check" size={26} color={colors.primary} />
          ) : (
            <ActivityIndicator color={colors.primary} />
          )}
        </View>
        <Text style={styles.title}>
          {failed ? 'Confirmation failed' : done ? 'You\u2019re in' : 'Confirming email'}
        </Text>
        <Text style={styles.message}>{message}</Text>
        {failed && (
          <PrimaryButton
            label="Return to sign up"
            onPress={() => router.replace('/(auth)/sign-up')}
            style={{ marginTop: spacing.xl }}
            fullWidth={false}
          />
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  logo: { width: 54, height: 54, marginBottom: spacing.xl },
  medallion: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  medallionError: {
    backgroundColor: colors.dangerSoft,
    borderColor: 'transparent',
  },
  medallionDone: {
    backgroundColor: colors.successSoft,
    borderColor: 'transparent',
  },
  title: {
    ...type.h1,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    ...type.body,
    color: colors.muted,
    textAlign: 'center',
    maxWidth: 320,
  },
});
