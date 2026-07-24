/**
 * Expo push notification registration.
 *
 * Token lifecycle: on login (with the preference enabled) we request
 * permission, fetch the Expo push token and upsert it into Supabase
 * `push_tokens`. Disabling the preference removes this device's token so the
 * sender stops targeting it.
 *
 * NOTE: remote push does not work in Expo Go on iOS (SDK 53+) — end-to-end
 * validation requires a dev/TestFlight build.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';

const PUSH_PREF_KEY = '@aiess_push_enabled';
const LAST_TOKEN_KEY = '@aiess_push_token';

// Show notifications while the app is foregrounded too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function getPushPreference(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(PUSH_PREF_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

export async function setPushPreference(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(PUSH_PREF_KEY, String(enabled));
  } catch { /* non-critical */ }
}

/**
 * OS-level notification permission. Used to detect the mismatch where the
 * in-app preference is on but the user revoked permission in system settings
 * (pushes then fail silently). Simulators report 'granted' to avoid noise.
 */
export async function getOsPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  if (!Device.isDevice) return 'granted';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status as 'granted' | 'denied' | 'undetermined';
  } catch {
    return 'granted';
  }
}

/**
 * Request permission, obtain the Expo push token and store it in Supabase.
 * Returns the token, or null if unavailable (simulator, permission denied,
 * Expo Go on iOS, or not logged in).
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  if (!Device.isDevice) return null;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('[Push] Missing EAS projectId — cannot fetch push token');
      return null;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: userId,
          token,
          platform: Platform.OS,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,token' }
      );
    if (error) {
      console.warn('[Push] Failed to store token:', error.message);
      return null;
    }

    await AsyncStorage.setItem(LAST_TOKEN_KEY, token);
    return token;
  } catch (err) {
    console.warn('[Push] Registration failed:', err);
    return null;
  }
}

/**
 * Fire-and-forget push to every user of a site via the send-push edge
 * function (authenticated with the caller's JWT). Failures are logged only —
 * push is never allowed to break the triggering action.
 */
export async function notifySitePush(
  siteId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('send-push', {
      body: { action: 'notify', site_id: siteId, title, body, data },
    });
    if (error) console.warn('[Push] notify failed:', error.message);
  } catch (err) {
    console.warn('[Push] notify failed:', err);
  }
}

/** Remove this device's token from Supabase (preference disabled / logout). */
export async function unregisterPushToken(userId: string): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(LAST_TOKEN_KEY);
    if (!token) return;
    await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('token', token);
    await AsyncStorage.removeItem(LAST_TOKEN_KEY);
  } catch { /* non-critical */ }
}
