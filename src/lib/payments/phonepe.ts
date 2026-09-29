// Android membership payment (PROJECT_PLAN.md §6) — PhonePe is now the only
// payment gateway the app uses (RevenueCat/Apple IAP stays on iOS separately,
// required by Apple Guideline 3.1.1). Opens PhonePe's hosted Standard Checkout
// page in an in-app browser and waits for it to redirect back to our custom
// scheme — same `phonepe-create-order` / `phonepe-verify-payment` /
// `phonepe-reconcile-payment` / `phonepe-webhook` Edge Functions used by the
// web build.
//
// Standard Checkout has no client-side signed callback the way Razorpay's
// Checkout `handler` did — the browser session resolving only means the user
// finished (or abandoned) the hosted page, never whether the payment itself
// succeeded. The caller must always follow up with phonepe-verify-payment /
// phonepe-reconcile-payment against PhonePe's Order Status API to learn the
// real outcome.
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

// Matches phonepe-redirect's APP_REDIRECT_URL and app.json's `expo.scheme`.
const REDIRECT_URL = 'reelspark://payment-callback';

export class PhonePeCancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'PhonePeCancelledError';
  }
}

// Resolves once the hosted checkout page redirects back to the app (payment
// attempted — outcome still unknown), or throws PhonePeCancelledError if the
// user dismissed the browser without reaching that redirect.
export async function openPhonePeCheckout(checkoutUrl: string): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new Error('PhonePe checkout is only available on Android.');
  }

  const result = await WebBrowser.openAuthSessionAsync(checkoutUrl, REDIRECT_URL);
  if (result.type !== 'success') {
    throw new PhonePeCancelledError();
  }
}
