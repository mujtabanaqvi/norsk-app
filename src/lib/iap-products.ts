/**
 * Subscription product ids, shared by the client and the server.
 * Use the same ids for the App Store, Google Play and RevenueCat Web Billing products, and attach them
 * to the RevenueCat entitlements `standard` / `premium` (see docs/PAYMENTS.md).
 */
export type PaidTier = 'STANDARD' | 'PREMIUM';

export const IAP_PRODUCT_IDS: Record<PaidTier, string> = {
  STANDARD: 'snakkly.standard.monthly',
  PREMIUM: 'snakkly.premium.monthly',
};

/** Accepts Google Play's `<productId>:<basePlanId>` form, which RevenueCat reports for Play subscriptions. */
export function tierForProductId(productId: string | null | undefined): PaidTier | null {
  if (!productId) return null;
  const baseId = productId.split(':')[0];
  for (const tier of Object.keys(IAP_PRODUCT_IDS) as PaidTier[]) {
    if (IAP_PRODUCT_IDS[tier] === baseId) return tier;
  }
  return null;
}
