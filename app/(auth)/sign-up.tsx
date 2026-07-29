import { Link } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isSupabaseConfigured, supabase } from '../../src/lib/supabase';

const emailRedirectTo = Linking.createURL('/(auth)/callback');

export default function SignUpScreen() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function signUp() {
    if (!isSupabaseConfigured) {
      Alert.alert('Supabase not configured', 'Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env.');
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo,
        data: { display_name: displayName.trim() },
      },
    });
    setBusy(false);

    if (error) Alert.alert('Sign-up failed', error.message);
    else Alert.alert('Check your email', 'Open the confirmation link on this device to finish creating your account.');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Create your account</Text>
        <TextInput style={styles.input} placeholder="Display name" value={displayName} onChangeText={setDisplayName} />
        <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={styles.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
        <Pressable style={styles.button} onPress={signUp} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? 'Creating…' : 'Create account'}</Text>
        </Pressable>
        <Link href="/(auth)/sign-in" style={styles.link}>Back to sign in</Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F7F2' },
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 14 },
  title: { fontSize: 34, fontWeight: '800', marginBottom: 8 },
  input: { backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 },
  button: { backgroundColor: '#173F35', borderRadius: 14, padding: 16, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  link: { textAlign: 'center', fontWeight: '700', marginTop: 6 },
});