import { Link } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isSupabaseConfigured, supabase } from '../../src/lib/supabase';

// Expo Router route groups such as `(auth)` are not part of the public URL.
// app/(auth)/callback.tsx is therefore reached at grosharey://callback.
// Omitting the leading slash prevents Expo from generating grosharey:///callback.
const emailRedirectTo = Linking.createURL('callback');

export default function SignUpScreen() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

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

    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo,
        data: { display_name: displayName.trim() },
      },
    });
    setBusy(false);

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

    setBusy(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: normalizedEmail,
      options: { emailRedirectTo },
    });
    setBusy(false);

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
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Create your account</Text>
        <TextInput
          style={styles.input}
          placeholder="Display name"
          placeholderTextColor="#6B746F"
          selectionColor="#173F35"
          textContentType="name"
          value={displayName}
          onChangeText={setDisplayName}
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#6B746F"
          selectionColor="#173F35"
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#6B746F"
          selectionColor="#173F35"
          secureTextEntry
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
        />
        <Pressable style={styles.button} onPress={signUp} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? 'Please wait…' : 'Create account'}</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={resendConfirmation} disabled={busy}>
          <Text style={styles.secondaryButtonText}>Resend confirmation email</Text>
        </Pressable>
        <Link href="/(auth)/sign-in" style={styles.link}>Back to sign in</Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F7F2' },
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 14 },
  title: { color: '#102C25', fontSize: 34, fontWeight: '800', marginBottom: 8 },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5D0',
    borderRadius: 14,
    borderWidth: 1,
    color: '#102C25',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  button: { backgroundColor: '#173F35', borderRadius: 14, padding: 16, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  secondaryButton: {
    borderColor: '#173F35',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#173F35', fontWeight: '700' },
  link: { color: '#173F35', textAlign: 'center', fontWeight: '700', marginTop: 6 },
});
