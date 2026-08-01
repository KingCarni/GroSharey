import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Stack, router, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { AuthProvider, useAuth } from '../src/lib/auth';
import { registerForPushNotifications } from '../src/lib/notifications';
import { colors, fontMap } from '../src/theme';

// Keep the native splash visible until fonts + auth are hydrated so we
// never flash the fallback system font first.
void SplashScreen.preventAutoHideAsync().catch(() => {
  /* preventing splash is best-effort */
});

function AuthGate() {
  const { session, loading, user } = useAuth();
  const navigationState = useRootNavigationState();
  const segments = useSegments();
  const localRouter = useRouter();

  useEffect(() => {
    if (loading || !navigationState?.key) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) localRouter.replace('/(auth)/sign-in');
    if (session && inAuthGroup) localRouter.replace('/');
  }, [loading, navigationState?.key, localRouter, segments, session]);

  useEffect(() => {
    if (!user) return;
    void registerForPushNotifications(user.id).catch((error) => {
      console.warn('Push registration failed', error);
    });
  }, [user]);

  return null;
}

function NotificationObserver() {
  useEffect(() => {
    function openNotification(notification: Notifications.Notification) {
      const url = notification.request.content.data?.url;
      if (typeof url === 'string') router.push(url as never);
    }

    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse?.notification) openNotification(lastResponse.notification);

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      openNotification(response.notification);
    });
    return () => subscription.remove();
  }, []);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontsError] = useFonts(fontMap);

  const onReady = useCallback(async () => {
    await SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontsError) void onReady();
  }, [fontsLoaded, fontsError, onReady]);

  if (!fontsLoaded && !fontsError) {
    // Native splash is still up — render nothing to avoid font flash.
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <AuthProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      />
      <AuthGate />
      <NotificationObserver />
      <StatusBar style="dark" />
    </AuthProvider>
  );
}
