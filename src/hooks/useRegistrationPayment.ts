import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthProvider';
import { appReturnUrl, openPhonePeCheckout, WEB_RETURN_URL } from '../lib/payments/phonepe';
import type { RegistrationPayment } from '../types/database';

// An 'initiated' row older than this is treated as an abandoned checkout, not an
// in-flight one (PhonePe expires an unpaid order after ~20 minutes).
export const CREATED_FRESH_MS = 20 * 60 * 1000;

export function isConfirming(payment: RegistrationPayment | null | undefined): boolean {
  if (!payment) return false;
  if (payment.status === 'submitted') return true;
  return (
    (payment.status === 'created' || payment.status === 'initiated') &&
    Date.now() - new Date(payment.created_at).getTime() < CREATED_FRESH_MS
  );
}

// The current user's most recent registration payment attempt. While it's still
// mid-flight (a fresh 'initiated' PhonePe order, or a legacy 'submitted' row) we
// poll so a webhook-only confirmation still flips the UI.
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

// phonepe-initiate response.
interface InitiateResponse {
  merchantOrderId: string;
  redirectUrl: string;
}

// phonepe-status response.
type PaymentStatusResponse = { status: 'approved' | 'rejected' | 'pending' };


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
// annual membership fee via `expo-web-browser`. Uses the live Edge Functions:
// phonepe-initiate creates the order, phonepe-status checks it against
// PhonePe's Order Status API (and approves the membership if COMPLETED);
// phonepe-callback (PhonePe's webhook) confirms it independently.
//  - resolves 'verified'        — checkout closed and the status check confirmed it
//  - resolves 'pending_webhook' — checkout closed but PhonePe hasn't settled yet;
//                                 the webhook/15s poll confirms it shortly (show a
//                                 "confirming" state, with Check again / Pay again)
//  - rejects  Error('payment_failed')  — PhonePe reported the payment failed
//  - rejects  Error(<reason>)          — order couldn't be created
export function usePayWithPhonePe() {
  const queryClient = useQueryClient();
  const { session, profile, refreshProfile } = useAuth();

  return useMutation<PayOutcome, Error, void>({
    mutationFn: async () => {
      // phonepe-initiate requires the payer's phone number (it also rejects a
      // number already registered to another account).
      const userPhone = profile?.phone?.trim();
      if (!userPhone) throw new Error('phone_required');

      // An earlier attempt still marked 'initiated' blocks a new order for the
      // same phone number (unique index on registration_payments), so settle it
      // against PhonePe first: paid → done, failed → free to retry, still
      // pending → don't create a second order.
      const { data: open } = await supabase
        .from('registration_payments')
        .select('merchant_order_id')
        .eq('user_id', session!.user.id)
        .eq('status', 'initiated')
        .not('merchant_order_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (open?.merchant_order_id) {
        const prior = await invokeFn<PaymentStatusResponse>('phonepe-status', {
          merchantOrderId: open.merchant_order_id,
        });
        if (prior.status === 'approved') return 'verified';
        if (prior.status === 'pending') throw new Error('payment_in_progress');
      }

      // Ask PhonePe to send the user back into the app when checkout ends. If
      // PhonePe rejects an app-scheme return URL (the order is refused before
      // anything is recorded), fall back to the website URL the web build uses.
      let returnUrl = appReturnUrl();
      let order: InitiateResponse;
      try {
        order = await invokeFn<InitiateResponse>('phonepe-initiate', { userPhone, redirectBaseUrl: returnUrl });
      } catch (err) {
        if (!(err as Error).message.startsWith('PhonePe pay API error')) throw err;
        console.warn('[phonepe] app return URL refused, falling back to the website URL:', (err as Error).message);
        returnUrl = WEB_RETURN_URL;
        order = await invokeFn<InitiateResponse>('phonepe-initiate', { userPhone, redirectBaseUrl: returnUrl });
      }

      await openPhonePeCheckout(order.redirectUrl, returnUrl);

      try {
        const check = await invokeFn<PaymentStatusResponse>('phonepe-status', {
          merchantOrderId: order.merchantOrderId,
        });
        if (check.status === 'approved') return 'verified';
        if (check.status === 'rejected') throw new Error('payment_failed');
        return 'pending_webhook';
      } catch (err) {
        if ((err as Error).message === 'payment_failed') throw err;
        // The status fetch itself failed (network blip etc.) — the webhook and
        // the 15s poll will still confirm it.
        console.error('[phonepe] status check failed:', err);
        return 'pending_webhook';
      }
    },
    onSuccess: async () => {
      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ['registrationPayment', session?.user.id] });
    },
  });
}

export interface ReconcileResult {
  status: 'approved' | 'rejected' | 'pending' | 'none';
}

// "Check again" on the confirming screen: asks the server to check the latest
// payment attempt against PhonePe's Order Status API and confirm it if paid,
// instantly.
export function useReconcilePayment() {
  const queryClient = useQueryClient();
  const { session, refreshProfile } = useAuth();

  return useMutation<ReconcileResult, Error, void>({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('registration_payments')
        .select('merchant_order_id')
        .eq('user_id', session!.user.id)
        .not('merchant_order_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data?.merchant_order_id) return { status: 'none' };
      return invokeFn<ReconcileResult>('phonepe-status', { merchantOrderId: data.merchant_order_id });
    },
    onSuccess: async () => {
      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ['registrationPayment', session?.user.id] });
    },
  });
}
