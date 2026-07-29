import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';

function getAuthValues(url: string) {
  const normalized = url.replace('#', '?');
  const parsed = new URL(normalized);

  return {
    code: parsed.searchParams.get('code'),
    accessToken: parsed.searchParams.get('access_token'),
    refreshToken: parsed.searchParams.get('refresh_token'),
    errorDescription: parsed.searchParams.get('error_description'),
  };
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const url = Linking.useURL();
  const [message, setMessage] = useState('Confirming your email…');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url) return;

    let active = true;

    async function finishConfirmation() {
      try {
        const { code, accessToken, refreshToken, errorDescription } = getAuthValues(url);

        if (errorDescription) throw new Error(decodeURIComponent(errorDescription));

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else {
          throw new Error('The confirmation link did not include a valid authentication code.');
        }

        if (!active) return;
        setMessage('Email confirmed! Opening GroSharey…');
        setTimeout(() => router.replace('/'), 500);
      } catch (error) {
        if (!active) return;
        setFailed(true);
        setMessage(error instanceof Error ? error.message : 'Email confirmation failed.');
      }
    }

    finishConfirmation();
    return () => {
      active = false;
    };
  }, [router, url]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {!failed && <ActivityIndicator size="large" />}
        <Text style={styles.title}>{failed ? 'Confirmation failed' : 'Confirming email'}</Text>
        <Text style={styles.message}>{message}</Text>
        {failed && (
          <Pressable style={styles.button} onPress={() => router.replace('/(auth)/sign-in')}>
            <Text style={styles.buttonText}>Return to sign in</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F7F2' },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  message: { fontSize: 16, lineHeight: 24, textAlign: 'center' },
  button: { backgroundColor: '#173F35', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14 },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
});