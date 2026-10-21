import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { recomputeUserTier, upsertSubscription, type SubscriptionStatus, type Tier } from '@/lib/entitlements';

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case 'active':
      return 'ACTIVE';
    case 'trialing':
      return 'TRIALING';
    case 'past_due':
      return 'PAST_DUE';
    case 'incomplete':
      return 'INACTIVE';
    default:
      return 'CANCELED';
  }
}

/**
 * Mirror a Stripe subscription into our subscriptions table and recompute the user's tier.
 * Used by the webhook and by the checkout-session lookup, so whichever arrives first wins and the other is a no-op.
 */
export async function syncStripeSubscription(subOrId: string | Stripe.Subscription): Promise<Tier | null> {
  const sub: any = typeof subOrId === 'string' ? await stripe.subscriptions.retrieve(subOrId) : subOrId;
  const userId: string | undefined = sub.metadata?.userId;
  const tier = sub.metadata?.tier as 'STANDARD' | 'PREMIUM' | undefined;
  if (!userId || (tier !== 'STANDARD' && tier !== 'PREMIUM')) return null;

  // Period fields live on the subscription in older API versions and on the item in newer ones.
  const item = sub.items?.data?.[0];
  const nowSeconds = Math.floor(Date.now() / 1000);
  const startSeconds = sub.current_period_start ?? item?.current_period_start ?? nowSeconds;
  const endSeconds = sub.current_period_end ?? item?.current_period_end ?? nowSeconds + 30 * 86400;

  await upsertSubscription({
    provider: 'STRIPE',
    externalId: sub.id,
    userId,
    tier,
    status: mapStripeStatus(sub.status),
    currentPeriodStart: new Date(startSeconds * 1000),
    currentPeriodEnd: new Date(endSeconds * 1000),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    environment: sub.livemode ? 'production' : 'sandbox',
    stripePriceId: item?.price?.id ?? null,
  });

  return recomputeUserTier(userId);
}
