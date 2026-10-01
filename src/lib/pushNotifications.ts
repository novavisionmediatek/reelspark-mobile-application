// Device push token registration (PROJECT_PLAN.md §7 — new capability, the web
// build never had real push delivery). This file only gets a token onto the
// device and into `device_push_tokens` (see the migration of the same name in
// reelsparks/supabase/migrations) — actually SENDING a push from a video
// moderation decision or a referral bonus credit is server-side work (a
// trigger/Edge Function calling Expo's push API) that isn't part of this file
// and hasn't been built yet.
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { supabase } from './supabase';

// expo-notifications throws at import time inside Expo Go on Android (remote
// push was removed from Expo Go in SDK 53), which would crash the whole app on
// launch. So it's loaded lazily, and never in Expo Go — push only works in a
// development/production build anyway.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

function loadNotifications(): typeof import('expo-notifications') | null {
  if (isExpoGo) return null;
  const Notifications = require('expo-notifications') as typeof import('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  return Notifications;
}

// Registers this device's Expo push token against the signed-in user. Safe to
// call every app start / login — `register_push_token` upserts by token, so
// calling it repeatedly (or from a device that previously belonged to a
// different account) just keeps the row current rather than duplicating it.
// Resolves quietly (no throw) on any failure — a user with push notifications
// blocked, or a build with no EAS project configured yet, should never see an
// error from this, just no token registered.
export async function registerForPushNotifications(): Promise<void> {
  try {
    const Notifications = loadNotifications();
    if (!Notifications) {
      console.log('[push] running in Expo Go — push notifications need a development build, skipping.');
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return;

    // Expo push tokens need the EAS project id, which only exists once an EAS
    // project has been created (PROJECT_PLAN.md §9, Phase 0 — still open).
    // Until then this is undefined and registration is a deliberate no-op.
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) {
      console.warn('[push] no EAS project id configured yet — skipping push registration.');
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;

    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    if (error) console.warn('[push] register_push_token failed:', error.message);
  } catch (err) {
    console.warn('[push] registration failed:', err);
  }
}
