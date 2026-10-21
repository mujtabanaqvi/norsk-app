import { tierForProductId } from '@/src/lib/iap-products';
import {
  findSubscriptionOwner,
  findUserIdByIapAccountToken,
  IapOwnershipError,
  recomputeUserTier,
  updateSubscriptionByExternalId,
  upsertSubscription,
  type Tier,
} from '@/lib/entitlements';
import {
  acknowledgeGoogleSubscription,
  getGoogleSubscription,
  mapGoogleSubscription,
} from '@/lib/iap/google';

/**
 * Fetch the authoritative purchase state from Google Play, store it and recompute the owner's tier.
 * `expectedUserId` is set for client-initiated verification: the purchase must belong to that user.
 */
export async function syncGooglePurchase(
  purchaseToken: string,
  expectedUserId?: string
): Promise<{ userId: string; tier: Tier } | null> {
  const sub = await getGoogleSubscription(purchaseToken);
  const productId = sub.lineItems?.[0]?.productId;
  const tier = tierForProductId(productId);
  if (!tier || !productId) return null;

  const tokenOwner = await findUserIdByIapAccountToken(sub.externalAccountIdentifiers?.obfuscatedExternalAccountId);
  const existingOwner = await findSubscriptionOwner('GOOGLE', purchaseToken);
  const linkedOwner = sub.linkedPurchaseToken ? await findSubscriptionOwner('GOOGLE', sub.linkedPurchaseToken) : null;
  const userId = existingOwner ?? tokenOwner ?? linkedOwner;
  if (!userId) return null;
  if (expectedUserId && userId !== expectedUserId) {
    throw new IapOwnershipError('This Google Play subscription belongs to another Snakkly account');
  }

  if (sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') {
    await acknowledgeGoogleSubscription(productId, purchaseToken);
  }

  // An upgrade/downgrade issues a new token; the one it replaces stops granting access.
  if (sub.linkedPurchaseToken) {
    await updateSubscriptionByExternalId('GOOGLE', sub.linkedPurchaseToken, { status: 'CANCELED' });
  }

  await upsertSubscription({
    provider: 'GOOGLE',
    externalId: purchaseToken,
    userId,
    productId,
    tier,
    ...mapGoogleSubscription(sub),
    environment: sub.testPurchase ? 'sandbox' : 'production',
  });

  return { userId, tier: await recomputeUserTier(userId) };
}
