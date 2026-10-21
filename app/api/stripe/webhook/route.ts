import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { syncStripeSubscription } from '@/lib/stripe-fulfillment';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  let event: Stripe.Event;

  try {
    if (webhookSecret) {
      if (!signature) throw new Error('Missing stripe-signature header');
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } else if (process.env.NODE_ENV !== 'production') {
      // Local development without `stripe listen`: accept unsigned events.
      event = JSON.parse(rawBody) as Stripe.Event;
    } else {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    }
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return NextResponse.json({ error: 'Webhook Error', message: err.message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          await syncStripeSubscription(
            typeof session.subscription === 'string' ? session.subscription : session.subscription.id
          );
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncStripeSubscription(event.data.object as Stripe.Subscription);
        break;

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
