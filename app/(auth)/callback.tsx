import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';

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
  const [message, setMessage] = useState('Confirming your email…');
  const [failed, setFailed] = useState(false);

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
          throw new Error('The confirmation link did not include a supported authentication token. Request a new confirmation email and use the newest link.');
        }

        if (!active) return;
        setMessage('Email confirmed! Opening GroSharey…');
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
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        {!failed && <ActivityIndicator size="large" color="#173F35" />}
        <Text style={styles.title}>{failed ? 'Confirmation failed' : 'Confirming email'}</Text>
        <Text style={styles.message}>{message}</Text>
        {failed && (
          <Pressable style={styles.button} onPress={() => router.replace('/(auth)/sign-up')}>
            <Text style={styles.buttonText}>Return to sign up</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F7F2' },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  title: { color: '#102C25', fontSize: 28, fontWeight: '800', textAlign: 'center' },
  message: { color: '#344B44', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  button: { backgroundColor: '#173F35', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14 },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
});
