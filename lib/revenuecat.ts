import { db } from '@/src/db';
import { users, subscriptions } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import {
  recomputeUserTier,
  upsertSubscription,
  type PaymentProvider,
  type SubscriptionStatus,
  type Tier,
  type UpsertSubscriptionInput,
} from '@/lib/entitlements';
import { tierForProductId, type PaidTier } from '@/src/lib/iap-products';

/**
 * RevenueCat is the single payment backend for iOS (App Store), Android (Google Play) and web (Stripe, via RevenueCat).
 * The RevenueCat App User ID is always our `users.id`. We never trust webhook bodies or the client: every sync
 * re-reads the subscriber from RevenueCat's REST API and writes it into the `subscriptions` table, which
 * `recomputeUserTier()` turns into `users.subscriptionTier`.
 */

const REVENUECAT_API = 'https://api.revenuecat.com/v1';

/** One entry of `subscriber.subscriptions` in the v1 GET /subscribers response (only the fields we use). */
export interface RevenueCatSubscription {
  store: string;
  purchase_date: string;
  expires_date: string | null;
  period_type?: 'normal' | 'trial' | 'intro' | 'prepaid' | string;
  is_sandbox?: boolean;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  refunded_at?: string | null;
}

/** One entry of `subscriber.entitlements`: the product that (last) granted this entitlement. */
export interface RevenueCatEntitlement {
  product_identifier: string;
  expires_date?: string | null;
}

export interface RevenueCatSubscriber {
  subscriptions: Record<string, RevenueCatSubscription>;
  entitlements?: Record<string, RevenueCatEntitlement>;
}

/** RevenueCat entitlement identifiers (docs/PAYMENTS.md §4.3) → tier. */
const ENTITLEMENT_TIER: Record<string, PaidTier> = { standard: 'STANDARD', premium: 'PREMIUM' };
const TIER_RANK: Record<PaidTier, number> = { STANDARD: 1, PREMIUM: 2 };

const STORE_PROVIDER: Record<string, PaymentProvider> = {
  app_store: 'APPLE',
  mac_app_store: 'APPLE',
  play_store: 'GOOGLE',
  rc_billing: 'STRIPE',
  stripe: 'STRIPE',
};

export function isRevenueCatAnonymousId(appUserId: string): boolean {
  return appUserId.startsWith('$RCAnonymousID:');
}

function subscriptionStatus(sub: RevenueCatSubscription, expiresAt: Date, now: Date): SubscriptionStatus {
  if (sub.refunded_at) return 'CANCELED';
  // RevenueCat extends expires_date through a store grace period, so a billing issue alone still entitles.
  if (expiresAt.getTime() > now.getTime()) return sub.period_type === 'trial' ? 'TRIALING' : 'ACTIVE';
  return sub.billing_issues_detected_at ? 'PAST_DUE' : 'CANCELED';
}

/**
 * Product id → tier, read from the subscriber's entitlements. Needed because store product ids are not
 * always ours: a RevenueCat Stripe Billing app reports Stripe price ids (`price_…`).
 * If one product grants both entitlements, the higher tier wins.
 */
function tiersFromEntitlements(subscriber: RevenueCatSubscriber): Map<string, PaidTier> {
  const tiers = new Map<string, PaidTier>();
  for (const [entitlementId, entitlement] of Object.entries(subscriber.entitlements ?? {})) {
    const tier = ENTITLEMENT_TIER[entitlementId.toLowerCase()];
    const productId = entitlement?.product_identifier;
    if (!tier || !productId) continue;
    const current = tiers.get(productId);
    if (!current || TIER_RANK[tier] > TIER_RANK[current]) tiers.set(productId, tier);
  }
  return tiers;
}

/**
 * Pure mapping from a RevenueCat subscriber to our subscription rows. A product's tier comes from our own
 * product ids, else from the entitlement it grants, else from `knownTiers` (tiers of rows stored earlier,
 * keyed by external id, so an expired product that no longer backs an entitlement still gets updated).
 * Unknown products and stores are skipped.
 */
export function mapSubscriberToRows(
  userId: string,
  subscriber: RevenueCatSubscriber,
  now: Date = new Date(),
  knownTiers: ReadonlyMap<string, PaidTier> = new Map()
): UpsertSubscriptionInput[] {
  const entitlementTiers = tiersFromEntitlements(subscriber);
  const rows: UpsertSubscriptionInput[] = [];
  for (const [productId, sub] of Object.entries(subscriber.subscriptions ?? {})) {
    const externalId = `rc:${userId}:${productId}`;
    const tier = tierForProductId(productId) ?? entitlementTiers.get(productId) ?? knownTiers.get(externalId);
    const provider = STORE_PROVIDER[sub.store];
    if (!tier || !provider || !sub.expires_date) continue;

    const expiresAt = new Date(sub.expires_date);
    rows.push({
      provider,
      externalId,
      userId,
      productId,
      tier,
      status: subscriptionStatus(sub, expiresAt, now),
      currentPeriodStart: new Date(sub.purchase_date),
      currentPeriodEnd: expiresAt,
      cancelAtPeriodEnd: Boolean(sub.unsubscribe_detected_at),
      environment: sub.is_sandbox ? 'sandbox' : 'production',
    });
  }
  return rows;
}

export async function fetchSubscriber(appUserId: string): Promise<RevenueCatSubscriber> {
  const apiKey = process.env.REVENUECAT_SECRET_API_KEY;
  if (!apiKey) throw new Error('REVENUECAT_SECRET_API_KEY is not configured');

  const res = await fetch(`${REVENUECAT_API}/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`RevenueCat GET /subscribers failed with ${res.status}`);
  }
  const data = await res.json();
  return data.subscriber as RevenueCatSubscriber;
}

/**
 * Pull the user's subscriptions from RevenueCat into our database and return the recomputed tier.
 * Returns null when no Snakkly user has this id (e.g. a webhook for a deleted account).
 */
export async function syncRevenueCatSubscriber(userId: string): Promise<Tier | null> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;

  const subscriber = await fetchSubscriber(userId);
  const stored = await db
    .select({ externalId: subscriptions.externalId, tier: subscriptions.tier })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));
  const knownTiers = new Map<string, PaidTier>();
  for (const row of stored) {
    if (row.tier !== 'FREE') knownTiers.set(row.externalId, row.tier);
  }

  for (const row of mapSubscriberToRows(userId, subscriber, new Date(), knownTiers)) {
    await upsertSubscription(row);
  }
  return recomputeUserTier(userId);
}
