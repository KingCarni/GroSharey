import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(userId: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('grosharey-updates', {
      name: 'GroSharey updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('EAS project ID is missing.');

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await supabase.from('device_tokens').upsert(
    {
      user_id: userId,
      expo_push_token: token,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'expo_push_token' },
  );
  if (error) throw error;
  return token;
}

/**
 * Flushes notification_outbox through the deployed Supabase Edge Function.
 * This is deliberately best-effort: an app action should still succeed if
 * push delivery is temporarily unavailable.
 */
export async function dispatchQueuedPushNotifications(): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('send-push-notifications', {
      body: {},
    });
    if (error) console.warn('Push dispatch failed:', error.message);
  } catch (error) {
    console.warn('Push dispatch failed:', error);
  }
}
