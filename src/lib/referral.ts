// Referral-link handling (native build). An invite link is `https://reelspark.in/?ref=CODE`
// or the `reelspark://` custom scheme, opened via Universal Links / App Links —
// native association config (apple-app-site-association / assetlinks.json on
// reelspark.in, `associatedDomains`/`intentFilters` in app.json) isn't wired yet,
// so today this only catches the code when the OS hands the URL to `Linking`.
//
// AsyncStorage replaces the web build's sessionStorage; since it's async, a
// synchronous in-memory cache mirrors it so callers that need a value without
// awaiting (AuthNavigator's initialRouteName, SignUpScreen's initial state) get
// a best-effort read — accurate once initReferralCapture() has resolved.
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'reelspark:referral';
let cache = '';

function extractCode(url: string): string | null {
  const match = url.match(/[?&]ref=([^&]+)/);
  if (!match) return null;
  try {
    const value = decodeURIComponent(match[1]).trim();
    return value ? value.toUpperCase().slice(0, 32) : null;
  } catch {
    return null;
  }
}

async function store(code: string) {
  cache = code;
  try {
    await AsyncStorage.setItem(KEY, code);
  } catch {
    /* storage unavailable — keep the in-memory value for this session */
  }
}

/** Call once on app start. Hydrates the cache from AsyncStorage, then checks
 *  the URL that launched the app (and any later deep link) for `?ref=CODE`. */
export async function initReferralCapture(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored) cache = stored;
  } catch {
    /* ignore */
  }

  const initialUrl = await Linking.getInitialURL();
  const initialCode = initialUrl ? extractCode(initialUrl) : null;
  if (initialCode) await store(initialCode);

  Linking.addEventListener('url', ({ url }) => {
    const code = extractCode(url);
    if (code) store(code);
  });
}

/** Best-effort synchronous read — populated once initReferralCapture() resolves. */
export function getStoredReferral(): string {
  return cache;
}

export function clearStoredReferral(): void {
  cache = '';
  AsyncStorage.removeItem(KEY).catch(() => {
    /* ignore */
  });
}

export function referralLink(code: string): string {
  return `https://reelspark.in/?ref=${encodeURIComponent(code)}`;
}
