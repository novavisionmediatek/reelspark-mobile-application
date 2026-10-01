// Android membership payment (PROJECT_PLAN.md §6) — PhonePe is the only
// payment gateway the app uses. Opens PhonePe's hosted Standard Checkout page
// (the `redirectUrl` returned by the `phonepe-initiate` Edge Function) in an
// in-app browser, then resolves once the user comes back.
//
// Standard Checkout has no client-side signed callback — coming back only
// means the user finished (or abandoned) the hosted page, never whether the
// payment itself succeeded. The caller must always follow up with
// `phonepe-status` (PhonePe's Order Status API) to learn the real outcome.
import * as WebBrowser from 'expo-web-browser';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

// Website PhonePe falls back to if it won't accept an app-scheme return URL.
// The in-app browser can't close itself on it — the user closes the tab.
export const WEB_RETURN_URL = 'https://reelspark.in';

// Where PhonePe sends the user after checkout so the in-app browser closes and
// they land back in the app: the `reelspark://` scheme (app.json) in a real
// build, or Expo Go's own `exp://` address while testing in Expo Go (which
// can't handle `reelspark://`).
export function appReturnUrl(): string {
  const hostUri = Constants.expoConfig?.hostUri;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient && hostUri) {
    return `exp://${hostUri}/--/payment-callback`;
  }
  return 'reelspark://payment-callback';
}

export async function openPhonePeCheckout(checkoutUrl: string, returnUrl: string): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('PhonePe checkout is only available on Android.');
  }

  await WebBrowser.openAuthSessionAsync(checkoutUrl, returnUrl);
}
