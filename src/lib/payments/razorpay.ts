// Android membership payment (PROJECT_PLAN.md §6). Replaces the web build's
// `checkout.razorpay.com/v1/checkout.js` browser overlay with the official
// native SDK — same `razorpay-create-order` / `razorpay-verify-payment` /
// `razorpay-webhook` Edge Functions, unchanged, reused as-is.
//
// react-native-razorpay wraps a native module and does NOT run inside Expo
// Go — it needs a development build (`npx expo run:android` or an EAS dev
// build) before this can be exercised at all. Untested here for that reason.
//
// Loaded with a lazy `require()` instead of a top-level `import`, and only on
// Android: the package's own RazorpayCheckout.js unconditionally constructs a
// `new NativeEventEmitter(...)` when the module is first evaluated, and React
// Native's NativeEventEmitter throws an invariant violation on iOS if the
// native module isn't linked (it's a no-op on Android). Razorpay is
// Android-only by design (iOS pays via RevenueCat, §6) and this module isn't
// linked for iOS builds at all, so a top-level `import` here would crash the
// entire app on iOS the moment this file loads — not just when a payment is
// attempted. A lazy, Android-gated `require()` means the package is never
// evaluated on iOS in the first place.
import { Platform } from 'react-native';
import type RazorpayCheckoutType from 'react-native-razorpay';
import type { ErrorResponse, SuccessResponse } from 'react-native-razorpay';

export interface OpenRazorpayOptions {
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  descriptionInr: number;
  prefill?: { name?: string; email?: string; contact?: string };
}

/** Razorpay's `contact` prefill wants a bare 10-digit / +91 number or it nags. */
export function looksLikePhone(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^(\+91)?[6-9]\d{9}$/.test(value.replace(/[\s-]/g, ''));
}

export class RazorpayCancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'RazorpayCancelledError';
  }
}

// Resolves with the checkout's success payload, or throws
// RazorpayCancelledError (the user dismissed the sheet) / a plain Error with
// Razorpay's own `description` for a genuine payment failure.
export async function openRazorpayCheckout(options: OpenRazorpayOptions): Promise<SuccessResponse> {
  if (Platform.OS !== 'android') {
    throw new Error('Razorpay checkout is only available on Android.');
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RazorpayCheckout: typeof RazorpayCheckoutType = require('react-native-razorpay').default;

  try {
    return await RazorpayCheckout.open({
      key: options.keyId,
      order_id: options.orderId,
      amount: options.amountPaise,
      currency: options.currency,
      name: 'ReelSpark',
      description: `Annual membership (₹${options.descriptionInr}/year)`,
      prefill: options.prefill,
      notes: { purpose: 'registration' },
      theme: { color: '#6153F5' },
    });
  } catch (err) {
    // react-native-razorpay rejects with ErrorResponse; code 0 (or a
    // description mentioning cancellation) is the "user dismissed" case.
    const e = err as ErrorResponse;
    if (e?.code === 0 || /cancel/i.test(e?.description ?? '')) {
      throw new RazorpayCancelledError();
    }
    throw new Error(e?.description ?? 'Payment failed. Please try again.');
  }
}
