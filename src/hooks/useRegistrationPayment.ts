import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthProvider';
import { openPhonePeCheckout, PhonePeCancelledError } from '../lib/payments/phonepe';
import {
  configureRevenueCat,
  getMembershipOffering,
  purchaseMembership,
  RevenueCatCancelledError,
} from '../lib/payments/revenuecat';
import type { RegistrationPayment } from '../types/database';

// A 'created' row older than this is treated as an abandoned checkout, not an
// in-flight one — matches REUSE_WINDOW_MIN in phonepe-create-order.
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
// mid-flight (a fresh 'created' PhonePe order, or a legacy 'submitted' row) we
// poll so a webhook-only confirmation still flips the UI. Also how the
// RevenueCat path notices its webhook landed — it never gets a client-side
// "verified" result the way the PhonePe checkout flow's instant verify fetch does.
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
  merchantOrderId: string;
  checkoutUrl: string;
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

// Android only (§6) — opens PhonePe's hosted Standard Checkout page for the
// annual membership fee via `expo-web-browser`, replacing the web build's
// checkout.js overlay. Same Edge Function flow as web:
//  - resolves 'verified'        — payment done and our instant verify fetch
//                                 (phonepe-verify-payment, called the moment the
//                                 checkout page closes) confirmed it
//  - resolves 'pending_webhook' — checkout closed but that instant fetch didn't
//                                 confirm yet (PhonePe hasn't settled); the
//                                 webhook/15s poll will confirm shortly (show a
//                                 "confirming" state) — never a manual admin review
//  - rejects  Error('cancelled')       — user dismissed the checkout page
//  - rejects  Error(<reason>)          — order couldn't be created
export function usePayWithPhonePe() {
  const queryClient = useQueryClient();
  const { session, refreshProfile } = useAuth();

  return useMutation<PayOutcome, Error, void>({
    mutationFn: async () => {
      const order = await invokeFn<CreateOrderResponse>('phonepe-create-order', {});

      try {
        await openPhonePeCheckout(order.checkoutUrl);
      } catch (err) {
        if (err instanceof PhonePeCancelledError) throw new Error('cancelled');
        throw err;
      }

      // Fetch the order status immediately — no waiting on an admin or a batch
      // job. phonepe-verify-payment calls PhonePe's Order Status API right now
      // and, if it's already COMPLETED, approves the membership in the same
      // request.
      try {
        const verify = await invokeFn<{ status: 'approved' | 'pending' | 'failed' }>(
          'phonepe-verify-payment',
          { merchantOrderId: order.merchantOrderId },
        );
        return verify.status === 'approved' ? 'verified' : 'pending_webhook';
      } catch (verifyErr) {
        // The instant fetch itself failed (network blip etc.) — fall back to
        // reconciling against PhonePe's Order Status API directly.
        console.error('[phonepe] verify-payment failed, reconciling:', verifyErr);
        try {
          const r = await invokeFn<{ status: string }>('phonepe-reconcile-payment', {
            merchantOrderId: order.merchantOrderId,
          });
          return r.status === 'approved' ? 'verified' : 'pending_webhook';
        } catch (reconcileErr) {
          console.error('[phonepe] reconcile failed:', reconcileErr);
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
// membership. Unlike PhonePe there's no client-side "verified" result: the
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
// latest unconfirmed payment against PhonePe's Order Status API and confirm
// it if paid, instantly. Android/PhonePe only — there is no equivalent manual
// recheck for the RevenueCat path yet (it just waits on the webhook + poll).
export function useReconcilePayment() {
  const queryClient = useQueryClient();
  const { session, refreshProfile } = useAuth();

  return useMutation<ReconcileResult, Error, void>({
    mutationFn: () => invokeFn<ReconcileResult>('phonepe-reconcile-payment', {}),
    onSuccess: async () => {
      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ['registrationPayment', session?.user.id] });
    },
  });
}
