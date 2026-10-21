/**
 * App Store / Google Play subscription product ids, shared by the mobile client and the server.
 * The same ids must be configured in App Store Connect (one subscription group) and Play Console.
 */
export type PaidTier = 'STANDARD' | 'PREMIUM';

export const IAP_PRODUCT_IDS: Record<PaidTier, string> = {
  STANDARD: 'snakkly.standard.monthly',
  PREMIUM: 'snakkly.premium.monthly',
};

export function tierForProductId(productId: string | null | undefined): PaidTier | null {
  if (!productId) return null;
  for (const tier of Object.keys(IAP_PRODUCT_IDS) as PaidTier[]) {
    if (IAP_PRODUCT_IDS[tier] === productId) return tier;
  }
  return null;
}
