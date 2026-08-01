import * as Linking from 'expo-linking';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import {
  AppScreen,
  PrimaryButton,
  SecondaryButton,
  TextField,
} from '../../src/components/ui';
import { isSupabaseConfigured, supabase } from '../../src/lib/supabase';
import { colors, spacing, type } from '../../src/theme';

// Expo Router route groups such as `(auth)` are not part of the public URL.
// app/(auth)/callback.tsx is therefore reached at grosharey://callback.
// Omitting the leading slash prevents Expo from generating grosharey:///callback.
const emailRedirectTo = Linking.createURL('callback');

export default function SignUpScreen() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'idle' | 'signup' | 'resend'>('idle');

  async function signUp() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!isSupabaseConfigured) {
      Alert.alert(
        'Supabase not configured',
        'Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to the EAS preview environment.',
      );
      return;
    }

    if (!displayName.trim() || !normalizedEmail || !password) {
      Alert.alert('Missing information', 'Enter your name, email, and password.');
      return;
    }

    setBusy('signup');
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo,
        data: { display_name: displayName.trim() },
      },
    });
    setBusy('idle');

    if (error) {
      Alert.alert('Sign-up failed', error.message);
      return;
    }

    if (data.session) {
      Alert.alert('Account created', 'Your account is ready.');
      return;
    }

    Alert.alert(
      'Check your email',
      'Open the newest GroSharey confirmation email on this device. If this address was used before, tap Resend confirmation email below.',
    );
  }

  async function resendConfirmation() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!isSupabaseConfigured) {
      Alert.alert(
        'Supabase not configured',
        'Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to the EAS preview environment.',
      );
      return;
    }

    if (!normalizedEmail) {
      Alert.alert('Email required', 'Enter the email address that needs confirmation.');
      return;
    }

    setBusy('resend');
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: normalizedEmail,
      options: { emailRedirectTo },
    });
    setBusy('idle');

    if (error) {
      Alert.alert('Could not resend email', error.message);
      return;
    }

    Alert.alert(
      'Confirmation requested',
      'Check your inbox and spam folder for the newest message. Supabase may suppress another message briefly if the address was requested too recently.',
    );
  }

  return (
    <AppScreen keyboard padded={false} scroll contentContainerStyle={styles.scroll}>
      <View style={styles.brandBlock}>
        <Image
          source={require('../../Assets/Logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.eyebrow}>NEW HERE</Text>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>
          One account, one household. Invite the people you shop with in the next step.
        </Text>
      </View>

      <View style={styles.form}>
        <TextField
          label="Display name"
          placeholder="Sam Rivera"
          leftIcon="user"
          textContentType="name"
          value={displayName}
          onChangeText={setDisplayName}
          returnKeyType="next"
        />
        <TextField
          label="Email"
          placeholder="you@household.com"
          leftIcon="mail"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
          returnKeyType="next"
        />
        <TextField
          label="Password"
          placeholder="At least 8 characters"
          leftIcon="lock"
          secure
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
          hint="You&rsquo;ll confirm your email after signing up."
          returnKeyType="done"
          onSubmitEditing={signUp}
        />

        <PrimaryButton
          label={busy === 'signup' ? 'Creating account…' : 'Create account'}
          loading={busy === 'signup'}
          disabled={busy !== 'idle'}
          onPress={signUp}
          size="lg"
          style={{ marginTop: spacing.md }}
          testID="sign-up-submit"
        />
        <SecondaryButton
          label={busy === 'resend' ? 'Resending…' : 'Resend confirmation email'}
          loading={busy === 'resend'}
          disabled={busy !== 'idle'}
          onPress={resendConfirmation}
          variant="soft"
          style={{ marginTop: spacing.sm }}
          testID="sign-up-resend"
        />

        <View style={styles.footerRow}>
          <Text style={styles.footerHint}>Already have an account?</Text>
          <Link href="/(auth)/sign-in" style={styles.footerLink}>Sign in</Link>
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  brandBlock: { alignItems: 'flex-start' },
  logo: { width: 60, height: 60, marginBottom: spacing.lg },
  eyebrow: { ...type.eyebrow, color: colors.primary, marginBottom: spacing.sm },
  title: { ...type.display, fontSize: 30, lineHeight: 36, marginBottom: spacing.sm },
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
