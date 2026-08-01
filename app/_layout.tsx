import * as Notifications from 'expo-notifications';
import { Stack, router, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../src/lib/auth';
import { registerForPushNotifications } from '../src/lib/notifications';

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
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F4F7F2' } }} />
      <AuthGate />
      <NotificationObserver />
      <StatusBar style="dark" />
    </AuthProvider>
  );
}
