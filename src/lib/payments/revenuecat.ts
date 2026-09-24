// iOS membership payment (PROJECT_PLAN.md §6). Apple Guideline 3.1.1 requires
// Apple's own in-app purchase for this kind of unlock, so iOS goes through
// RevenueCat (wrapping StoreKit) instead of Razorpay. RevenueCat's webhook
// (supabase/functions/revenuecat-webhook, not yet deployed — see that file)
// is what actually flips profiles.payment_status; this module only drives the
// purchase sheet and lets the caller poll for the webhook to land, the same
// "pending_webhook" pattern the Razorpay path already uses.
//
// Meaningless without a real RevenueCat project + an App Store Connect
// subscription product — neither exists yet (§9 Phase 0's "kick off
// immediately, longest lead time" item). Untested for that reason.
import Purchases, { type PurchasesOffering, type PurchasesPackage } from 'react-native-purchases';

const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';

let configured = false;

export function isRevenueCatConfigured(): boolean {
  return !!REVENUECAT_IOS_API_KEY;
}

// appUserID is set to the Supabase auth user id so revenuecat-webhook can map
// RevenueCat's `app_user_id` straight to `profiles.id` with no extra lookup.
// Safe to call on every app start / login: configure() is a no-op after the
// first call, and logIn() with the same id is idempotent.
export async function configureRevenueCat(supabaseUserId: string): Promise<void> {
  if (!REVENUECAT_IOS_API_KEY) {
    console.warn('[revenuecat] EXPO_PUBLIC_REVENUECAT_IOS_KEY is not set — skipping.');
    return;
  }
  if (!configured) {
    Purchases.configure({ apiKey: REVENUECAT_IOS_API_KEY });
    configured = true;
  }
  await Purchases.logIn(supabaseUserId);
}

export async function getMembershipOffering(): Promise<PurchasesOffering | null> {
  const offerings = await Purchases.getOfferings();
  return offerings.current;
}

export class RevenueCatCancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'RevenueCatCancelledError';
  }
}

export async function purchaseMembership(pkg: PurchasesPackage): Promise<void> {
  try {
    await Purchases.purchasePackage(pkg);
  } catch (err) {
    const e = err as { userCancelled?: boolean; message?: string };
    if (e?.userCancelled) throw new RevenueCatCancelledError();
    throw new Error(e?.message ?? 'Purchase failed. Please try again.');
  }
}
