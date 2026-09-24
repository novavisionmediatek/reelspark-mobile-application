import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthProvider';
import { looksLikePhone, openRazorpayCheckout, RazorpayCancelledError } from '../lib/payments/razorpay';
import {
  configureRevenueCat,
  getMembershipOffering,
  purchaseMembership,
  RevenueCatCancelledError,
} from '../lib/payments/revenuecat';
import type { RegistrationPayment } from '../types/database';

// A 'created' row older than this is treated as an abandoned checkout, not an
// in-flight one — matches the reuse window in start_razorpay_payment.
export const CREATED_FRESH_MS = 15 * 60 * 1000;

export function isConfirming(payment: RegistrationPayment | null | undefined): boolean {
  if (!payment) return false;
  if (payment.status === 'submitted') return true;
  return (
    payment.status === 'created' &&
    Date.now() - new Date(payment.created_at).getTime() < CREATED_FRESH_MS
  );
}

// The current user's most recent registration payment attempt. While it's still
// mid-flight (a fresh 'created' Razorpay order, or a legacy 'submitted' row) we
// poll so a webhook-only confirmation still flips the UI. Also how the
// RevenueCat path notices its webhook landed — it never gets a client-side
// "verified" result the way Razorpay's checkout `handler` callback does.
export function useRegistrationPayment() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['registrationPayment', userId],
    enabled: !!userId,
    refetchInterval: (query) => {
      return isConfirming(query.state.data as RegistrationPayment | null) ? 15000 : false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from('registration_payments')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as RegistrationPayment | null) ?? null;
    },
  });
}

interface CreateOrderResponse {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  registrationFeeInr: number;
}

// supabase.functions.invoke throws a FunctionsHttpError for any non-2xx; the real
// { error: "<code>" } body is on error.context (a Response). Unwrap it so callers
// see e.g. "membership_active" instead of "Edge Function returned a non-2xx...".
async function invokeFn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let code = error.message;
    try {
      const parsed = await (error as { context?: Response }).context?.json?.();
      if (parsed && typeof parsed.error === 'string') code = parsed.error;
    } catch {
      /* body wasn't JSON — keep the generic message */
    }
    throw new Error(code);
  }
  return data as T;
}

export type PayOutcome = 'verified' | 'pending_webhook';

// Android only (§6) — opens the native Razorpay Checkout sheet for the annual
// membership fee via `react-native-razorpay`, replacing the web build's
// checkout.js overlay. Same Edge Function flow as web:
//  - resolves 'verified'        — payment done and our verify call confirmed it
//  - resolves 'pending_webhook' — payment done, verify call failed; the webhook
//                                 will confirm shortly (show a "confirming" state)
//  - rejects  Error('cancelled')       — user dismissed the sheet
//  - rejects  Error(<reason>)          — payment failed / order couldn't be created
export function usePayWithRazorpay() {
  const queryClient = useQueryClient();
  const { session, profile, refreshProfile } = useAuth();

  return useMutation<PayOutcome, Error, void>({
    mutationFn: async () => {
      const order = await invokeFn<CreateOrderResponse>('razorpay-create-order', {});

      let resp;
      try {
        resp = await openRazorpayCheckout({
          keyId: order.keyId,
          orderId: order.orderId,
          amountPaise: order.amount,
          currency: order.currency,
          descriptionInr: order.registrationFeeInr,
          prefill: {
            name: profile?.display_name ?? undefined,
            email: profile?.email ?? undefined,
            contact: looksLikePhone(profile?.phone) ? profile.phone : undefined,
          },
        });
      } catch (err) {
        if (err instanceof RazorpayCancelledError) throw new Error('cancelled');
        throw err;
      }

      try {
        await invokeFn('razorpay-verify-payment', {
          razorpay_order_id: resp.razorpay_order_id,
          razorpay_payment_id: resp.razorpay_payment_id,
          razorpay_signature: resp.razorpay_signature,
        });
        return 'verified';
      } catch (verifyErr) {
        // Payment succeeded at Razorpay but our signature-verify call didn't
        // confirm. Fall back to reconciling against Razorpay's API directly
        // (works with no webhook configured).
        console.error('[razorpay] verify-payment failed, reconciling:', verifyErr);
        try {
          const r = await invokeFn<{ status: string }>('razorpay-reconcile-payment', {
            razorpay_order_id: resp.razorpay_order_id,
          });
          return r.status === 'approved' ? 'verified' : 'pending_webhook';
        } catch (reconcileErr) {
          console.error('[razorpay] reconcile failed:', reconcileErr);
          return 'pending_webhook';
        }
      }
    },
    onSuccess: async () => {
      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ['registrationPayment', session?.user.id] });
    },
  });
}

// iOS only (§6) — RevenueCat/StoreKit purchase sheet for the same annual
// membership. Unlike Razorpay there's no client-side "verified" result: the
// purchase sheet resolving just means Apple accepted the payment, not that
// our backend has recorded it — that only happens once RevenueCat's webhook
// reaches revenuecat-webhook (not yet deployed). So this always resolves
// 'pending_webhook' on a successful purchase; useRegistrationPayment's 15s
// poll is what actually notices the entitlement land.
export function usePurchaseWithRevenueCat() {
  const queryClient = useQueryClient();
  const { session, refreshProfile } = useAuth();

  return useMutation<PayOutcome, Error, void>({
    mutationFn: async () => {
      if (!session?.user) throw new Error('You must be logged in to pay.');
      await configureRevenueCat(session.user.id);
      const offering = await getMembershipOffering();
      const pkg = offering?.availablePackages[0];
      if (!pkg) throw new Error('Membership is not available for purchase yet.');

      try {
        await purchaseMembership(pkg);
      } catch (err) {
        if (err instanceof RevenueCatCancelledError) throw new Error('cancelled');
        throw err;
      }

      return 'pending_webhook';
    },
    onSuccess: async () => {
      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ['registrationPayment', session?.user.id] });
    },
  });
}

export interface ReconcileResult {
  status: 'approved' | 'pending' | 'none';
}

// "Check again" on the confirming screen: asks the server to reconcile the
// latest unconfirmed payment against Razorpay's API and confirm it if paid.
// Android/Razorpay only — there is no equivalent manual recheck for the
// RevenueCat path yet (it just waits on the webhook + poll).
export function useReconcilePayment() {
  const queryClient = useQueryClient();
  const { session, refreshProfile } = useAuth();

  return useMutation<ReconcileResult, Error, void>({
    mutationFn: () => invokeFn<ReconcileResult>('razorpay-reconcile-payment', {}),
    onSuccess: async () => {
      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ['registrationPayment', session?.user.id] });
    },
  });
}
