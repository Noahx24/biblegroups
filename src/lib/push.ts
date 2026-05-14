/**
 * Push notification setup.
 *
 * Call setNotificationHandler() once at app start (App.tsx) so foreground
 * notifications show as banners. Call registerForPushNotificationsAsync(userId)
 * after sign-in to request OS permission, get the Expo push token, and store
 * it in device_push_tokens for the reminder edge function to consume.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

let handlerInstalled = false;

export function setNotificationHandler() {
  if (handlerInstalled) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// Track the last user the token was upserted for so we don't re-request the
// token on every render of useAuth's effect.
let registeredForUserId: string | null = null;
let currentPushToken: string | null = null;

/** Returns the Expo push token registered for the current device, or null if not yet registered. */
export function getCurrentPushToken(): string | null {
  return currentPushToken;
}

export async function registerForPushNotificationsAsync(userId: string): Promise<string | null> {
  if (!Device.isDevice) {
    // Push doesn't work on a simulator; silently skip.
    return null;
  }
  if (registeredForUserId === userId) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#B0202C',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const res = await Notifications.requestPermissionsAsync();
    status = res.status;
  }
  if (status !== 'granted') {
    console.warn('push: permission denied');
    return null;
  }

  // eas.projectId comes from app.json -> extra.eas.projectId. If it's the
  // placeholder, bail out cleanly — the user hasn't run `eas init` yet.
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  if (!projectId || projectId === 'REPLACE_WITH_EAS_PROJECT_ID') {
    console.warn('push: EAS projectId not configured (set app.json -> extra.eas.projectId)');
    return null;
  }

  let token: string;
  try {
    const res = await Notifications.getExpoPushTokenAsync({ projectId });
    token = res.data;
  } catch (e) {
    console.warn('push: failed to get token', e);
    return null;
  }

  const { error } = await supabase
    .from('device_push_tokens')
    .upsert(
      {
        user_id: userId,
        expo_push_token: token,
        platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,expo_push_token' },
    );
  if (error) {
    console.warn('push: token upsert failed', error);
    return null;
  }
  registeredForUserId = userId;
  currentPushToken = token;
  return token;
}

/** Clear the registered-user cache; call on sign-out. */
export function resetPushRegistrationCache() {
  registeredForUserId = null;
  currentPushToken = null;
}
