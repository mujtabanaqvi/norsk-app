import type { PaidTierResult } from '../api';
import type { PaidTier } from './iap-products';

/** Web build: store purchases are not available; subscriptions go through Stripe Checkout instead. */

export const isIapSupported = false;

export interface IapListenerHandlers {
  onVerified: (result: PaidTierResult, userInitiated: boolean) => void;
  onPending: () => void;
  onError: (error: unknown) => void;
}

export function startIapListener(_handlers: IapListenerHandlers): () => void {
  return () => {};
}

export async function getSubscriptionProducts(): Promise<Partial<Record<PaidTier, { displayPrice: string }>>> {
  return {};
}

export async function buySubscription(_tier: PaidTier, _iapAccountToken: string): Promise<void> {
  throw new Error('In-app purchases are not available on web');
}

export async function restorePurchases(): Promise<PaidTierResult | null> {
  return null;
}

export async function openManageSubscriptions(_tier?: PaidTier): Promise<void> {}
