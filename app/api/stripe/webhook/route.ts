import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { db } from '@/src/db';
import { users, subscriptions } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  let event: Stripe.Event;

  try {
    if (webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } else {
      // In dev environment or test mock without configured webhook secret:
      event = JSON.parse(rawBody) as Stripe.Event;
    }
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return NextResponse.json({ error: 'Webhook Error', message: err.message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const tier = session.metadata?.tier as 'STANDARD' | 'PREMIUM';

        if (userId && tier && session.subscription) {
          const subscriptionId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id;

          // Retrieve full subscription details
          const stripeSub: any = await stripe.subscriptions.retrieve(subscriptionId);

          // Update user tier
          await db
            .update(users)
            .set({
              subscriptionTier: tier,
              updatedAt: new Date(),
            })
            .where(eq(users.id, userId));

          // Upsert subscription record
          const startSeconds = stripeSub.current_period_start || Math.floor(Date.now() / 1000);
          const endSeconds = stripeSub.current_period_end || Math.floor(Date.now() / 1000) + 30 * 86400;

          await db
            .insert(subscriptions)
            .values({
              userId,
              stripeSubscriptionId: stripeSub.id,
              stripePriceId: stripeSub.items?.data?.[0]?.price?.id || 'price_manual',
              tier,
              status: 'ACTIVE',
              currentPeriodStart: new Date(startSeconds * 1000),
              currentPeriodEnd: new Date(endSeconds * 1000),
              cancelAtPeriodEnd: Boolean(stripeSub.cancel_at_period_end),
            })
            .onConflictDoNothing();
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub: any = event.data.object;
        const userId = sub.metadata?.userId;
        const tier = (sub.metadata?.tier as 'STANDARD' | 'PREMIUM') || 'STANDARD';

        if (userId) {
          const isCurrentActive = sub.status === 'active' || sub.status === 'trialing';
          await db
            .update(users)
            .set({
              subscriptionTier: isCurrentActive ? tier : 'FREE',
              updatedAt: new Date(),
            })
            .where(eq(users.id, userId));

          const startSeconds = sub.current_period_start || Math.floor(Date.now() / 1000);
          const endSeconds = sub.current_period_end || Math.floor(Date.now() / 1000) + 30 * 86400;

          await db
            .update(subscriptions)
            .set({
              status: sub.status === 'active' ? 'ACTIVE' : sub.status === 'past_due' ? 'PAST_DUE' : 'CANCELED',
              currentPeriodStart: new Date(startSeconds * 1000),
              currentPeriodEnd: new Date(endSeconds * 1000),
              cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.stripeSubscriptionId, sub.id));
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub: any = event.data.object;
        const userId = sub.metadata?.userId;

        if (userId) {
          // Revert user to FREE tier
          await db
            .update(users)
            .set({
              subscriptionTier: 'FREE',
              updatedAt: new Date(),
            })
            .where(eq(users.id, userId));

          await db
            .update(subscriptions)
            .set({
              status: 'CANCELED',
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.stripeSubscriptionId, sub.id));
        }
        break;
      }

      default:
        // Ignore unhandled event types
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error handling Stripe webhook event:', error);
    return NextResponse.json({ error: 'Webhook processing error' }, { status: 500 });
  }
}

