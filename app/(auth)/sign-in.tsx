import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import { AppScreen, PrimaryButton, TextField } from '../../src/components/ui';
import { isSupabaseConfigured, supabase } from '../../src/lib/supabase';
import { colors, spacing, type } from '../../src/theme';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setError(null);
    if (!isSupabaseConfigured) {
      Alert.alert('Supabase not configured', 'Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to the EAS preview environment.');
      return;
    }

    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);

    if (signInError) setError(signInError.message);
  }

  return (
    <AppScreen keyboard padded={false}>
      <View style={styles.container}>
        <View style={styles.brandBlock}>
          <Image
            source={require('../../Assets/Logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.eyebrow}>GROSHAREY</Text>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>
            Sign in to keep your household&rsquo;s lists, receipts and shopping trips in sync.
          </Text>
        </View>

        <View style={styles.form}>
          <TextField
            label="Email"
            placeholder="you@household.com"
            leftIcon="mail"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            value={email}
            onChangeText={(next) => {
              setEmail(next);
              if (error) setError(null);
            }}
            returnKeyType="next"
          />
          <TextField
            label="Password"
            placeholder="At least 8 characters"
            leftIcon="lock"
            secure
            textContentType="password"
            value={password}
            onChangeText={(next) => {
              setPassword(next);
              if (error) setError(null);
            }}
            error={error}
            returnKeyType="done"
            onSubmitEditing={signIn}
          />

          <PrimaryButton
            label={busy ? 'Signing in…' : 'Sign in'}
            loading={busy}
            onPress={signIn}
            size="lg"
            style={{ marginTop: spacing.md }}
            testID="sign-in-submit"
          />

          <View style={styles.footerRow}>
            <Text style={styles.footerHint}>Don&rsquo;t have an account yet?</Text>
            <Link href="/(auth)/sign-up" style={styles.footerLink}>Create one</Link>
          </View>
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
  },
  brandBlock: { alignItems: 'flex-start' },
  logo: { width: 68, height: 68, marginBottom: spacing.lg },
  eyebrow: { ...type.eyebrow, color: colors.primary, marginBottom: spacing.md },
  title: { ...type.display, marginBottom: spacing.sm },
  subtitle: { ...type.body, color: colors.muted, maxWidth: 360 },
  form: { marginTop: spacing.xl },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
    gap: spacing.xs,
  },
  footerHint: { ...type.body, color: colors.muted },
  footerLink: {
    ...type.button,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});
