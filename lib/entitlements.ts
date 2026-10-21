import { db } from '@/src/db';
import { users, subscriptions } from '@/src/db/schema';
import { and, eq } from 'drizzle-orm';

export type Tier = 'FREE' | 'STANDARD' | 'PREMIUM';
export type PaymentProvider = 'STRIPE' | 'APPLE' | 'GOOGLE';
export type SubscriptionStatus = 'INACTIVE' | 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED';

/** A store purchase was verified, but it is tied to a different Snakkly account than the caller. */
export class IapOwnershipError extends Error {}

const TIER_RANK: Record<Tier, number> = { FREE: 0, STANDARD: 1, PREMIUM: 2 };

export interface EntitlementRow {
  tier: Tier;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  provider?: PaymentProvider;
}

/** A subscription grants its tier while it is active (or trialing) and its paid period has not ended. */
export function isEntitling(row: EntitlementRow, now: Date = new Date()): boolean {
  return (row.status === 'ACTIVE' || row.status === 'TRIALING') && row.currentPeriodEnd.getTime() > now.getTime();
}

/** Highest tier across all of a user's subscriptions, regardless of which store sold them. */
export function pickEffectiveTier(rows: EntitlementRow[], now: Date = new Date()): Tier {
  let best: Tier = 'FREE';
  for (const row of rows) {
    if (isEntitling(row, now) && TIER_RANK[row.tier] > TIER_RANK[best]) {
      best = row.tier;
    }
  }
  return best;
}

/** Provider of the subscription currently granting the user's tier, if any. */
export function pickActiveProvider(rows: EntitlementRow[], now: Date = new Date()): PaymentProvider | null {
  const tier = pickEffectiveTier(rows, now);
  if (tier === 'FREE') return null;
  return rows.find((r) => r.tier === tier && isEntitling(r, now))?.provider ?? null;
}

export interface UpsertSubscriptionInput {
  provider: PaymentProvider;
  externalId: string;
  userId: string;
  productId?: string | null;
  tier: 'STANDARD' | 'PREMIUM';
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  environment?: 'sandbox' | 'production';
  stripePriceId?: string | null;
}

/** Idempotent: safe to call from webhooks, store notifications and client-triggered verification alike. */
export async function upsertSubscription(input: UpsertSubscriptionInput) {
  const values = {
    userId: input.userId,
    provider: input.provider,
    externalId: input.externalId,
    productId: input.productId ?? null,
    environment: input.environment ?? 'production',
    stripeSubscriptionId: input.provider === 'STRIPE' ? input.externalId : null,
    stripePriceId: input.stripePriceId ?? null,
    tier: input.tier,
    status: input.status,
    currentPeriodStart: input.currentPeriodStart,
    currentPeriodEnd: input.currentPeriodEnd,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd,
  };

  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: [subscriptions.provider, subscriptions.externalId],
      set: { ...values, updatedAt: new Date() },
    });
}

/** Patch an existing subscription found by provider + external id. Returns the owning userId, if found. */
export async function updateSubscriptionByExternalId(
  provider: PaymentProvider,
  externalId: string,
  patch: Partial<Pick<UpsertSubscriptionInput, 'status' | 'currentPeriodStart' | 'currentPeriodEnd' | 'cancelAtPeriodEnd'>>
): Promise<string | null> {
  const [row] = await db
    .update(subscriptions)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(subscriptions.provider, provider), eq(subscriptions.externalId, externalId)))
    .returning({ userId: subscriptions.userId });
  return row?.userId ?? null;
}

async function loadEntitlementRows(userId: string): Promise<EntitlementRow[]> {
  return db
    .select({
      tier: subscriptions.tier,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      provider: subscriptions.provider,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));
}

/**
 * Recalculate users.subscriptionTier from every subscription the user holds.
 * All payment handlers call this instead of writing the tier directly, so one provider's
 * cancellation can never downgrade a user who is still paying through another.
 */
export async function recomputeUserTier(userId: string): Promise<Tier> {
  const tier = pickEffectiveTier(await loadEntitlementRows(userId));
  await db.update(users).set({ subscriptionTier: tier, updatedAt: new Date() }).where(eq(users.id, userId));
  return tier;
}

export async function getActiveSubscriptionProvider(userId: string): Promise<PaymentProvider | null> {
  return pickActiveProvider(await loadEntitlementRows(userId));
}

export async function findUserIdByIapAccountToken(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.iapAccountToken, token.toLowerCase()))
    .limit(1);
  return row?.id ?? null;
}

export async function findSubscriptionOwner(provider: PaymentProvider, externalId: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(and(eq(subscriptions.provider, provider), eq(subscriptions.externalId, externalId)))
    .limit(1);
  return row?.userId ?? null;
}
