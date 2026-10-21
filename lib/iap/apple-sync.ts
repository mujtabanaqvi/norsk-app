import type { JWSRenewalInfoDecodedPayload, JWSTransactionDecodedPayload } from '@apple/app-store-server-library';
import { tierForProductId } from '@/src/lib/iap-products';
import {
  findSubscriptionOwner,
  findUserIdByIapAccountToken,
  IapOwnershipError,
  recomputeUserTier,
  upsertSubscription,
  type SubscriptionStatus,
  type Tier,
} from '@/lib/entitlements';
import { APPLE_BUNDLE_ID, appleEnvironmentLabel } from '@/lib/iap/apple';

export interface AppleSubscriptionState {
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

/** Translate a verified StoreKit transaction (+ optional renewal info) into our subscription state. */
export function mapAppleTransaction(
  tx: Pick<JWSTransactionDecodedPayload, 'purchaseDate' | 'expiresDate' | 'revocationDate'>,
  renewal?: Pick<JWSRenewalInfoDecodedPayload, 'autoRenewStatus' | 'gracePeriodExpiresDate'> | null,
  now: Date = new Date()
): AppleSubscriptionState {
  const start = new Date(tx.purchaseDate ?? now.getTime());
  // During a billing grace period Apple keeps access until gracePeriodExpiresDate.
  const endMs = Math.max(tx.expiresDate ?? 0, renewal?.gracePeriodExpiresDate ?? 0);
  const end = new Date(endMs);
  const revoked = Boolean(tx.revocationDate);
  return {
    status: revoked ? 'CANCELED' : end.getTime() > now.getTime() ? 'ACTIVE' : 'CANCELED',
    currentPeriodStart: start,
    currentPeriodEnd: revoked ? new Date(tx.revocationDate!) : end,
    cancelAtPeriodEnd: renewal ? renewal.autoRenewStatus === 0 : false,
  };
}

/**
 * Store a verified Apple transaction against its owner and recompute the tier.
 * `expectedUserId` is set for client-initiated verification: the transaction must belong to that user.
 */
export async function syncAppleTransaction(
  tx: JWSTransactionDecodedPayload,
  renewal?: JWSRenewalInfoDecodedPayload | null,
  expectedUserId?: string
): Promise<{ userId: string; tier: Tier } | null> {
  const tier = tierForProductId(tx.productId);
  if (tx.bundleId !== APPLE_BUNDLE_ID || !tier || !tx.originalTransactionId) return null;

  const tokenOwner = await findUserIdByIapAccountToken(tx.appAccountToken);
  const existingOwner = await findSubscriptionOwner('APPLE', tx.originalTransactionId);
  const userId = existingOwner ?? tokenOwner;
  if (!userId) return null;
  if (expectedUserId && userId !== expectedUserId) {
    // Same Apple ID, different Snakkly account: the subscription stays with the account that bought it.
    throw new IapOwnershipError('This App Store subscription belongs to another Snakkly account');
  }

  await upsertSubscription({
    provider: 'APPLE',
    externalId: tx.originalTransactionId,
    userId,
    productId: tx.productId,
    tier,
    ...mapAppleTransaction(tx, renewal),
    environment: appleEnvironmentLabel(tx.environment),
  });

  return { userId, tier: await recomputeUserTier(userId) };
}
