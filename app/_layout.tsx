import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../src/lib/auth';

function AuthGate() {
  const { session, loading } = useAuth();
  const navigationState = useRootNavigationState();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading || !navigationState?.key) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
      return;
    }

    if (session && inAuthGroup) {
      router.replace('/');
    }
  }, [loading, navigationState?.key, router, segments, session]);

  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerTitleAlign: 'center' }} />
      <AuthGate />
      <StatusBar style="auto" />
    </AuthProvider>
  );
}
