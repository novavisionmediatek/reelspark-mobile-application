import { useCallback, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface NotificationPrefs {
  videoStatus: boolean;
  referralRewards: boolean;
  productUpdates: boolean;
}

const STORAGE_KEY = 'reelspark:notificationPrefs';

const DEFAULTS: NotificationPrefs = {
  videoStatus: true,
  referralRewards: true,
  productUpdates: false,
};

const listeners = new Set<() => void>();

// AsyncStorage is async, unlike the web build's localStorage — snapshot starts
// at DEFAULTS and is hydrated once AsyncStorage resolves, notifying subscribers.
let snapshot: NotificationPrefs = DEFAULTS;

AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    if (!raw) return;
    snapshot = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<NotificationPrefs>) };
    listeners.forEach((l) => l());
  })
  .catch(() => {
    /* storage unavailable — keep defaults for this session */
  });

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function useNotificationPrefs() {
  const prefs = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);

  const setPref = useCallback((key: keyof NotificationPrefs, value: boolean) => {
    snapshot = { ...snapshot, [key]: value };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)).catch(() => {
      /* storage unavailable — keep the in-memory value for this session */
    });
    listeners.forEach((l) => l());
  }, []);

  return { prefs, setPref };
}
