import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isSupabaseConfigured, supabase } from '../../src/lib/supabase';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn() {
    if (!isSupabaseConfigured) {
      Alert.alert('Supabase not configured', 'Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) Alert.alert('Sign-in failed', error.message);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to your shared grocery household.</Text>
        <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={styles.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
        <Pressable style={styles.button} onPress={signIn} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
        </Pressable>
        <Link href="/(auth)/sign-up" style={styles.link}>Create an account</Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F7F2' },
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 14 },
  title: { fontSize: 36, fontWeight: '800' },
  subtitle: { fontSize: 17, lineHeight: 24, marginBottom: 10 },
  input: { backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 },
  button: { backgroundColor: '#173F35', borderRadius: 14, padding: 16, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  link: { textAlign: 'center', fontWeight: '700', marginTop: 6 },
});
