import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, AuthenticationError } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { syncStripeSubscription } from '@/lib/stripe-fulfillment';

/**
 * Called by the app's PaymentResult screen after Stripe Checkout redirects back.
 * Fulfils the subscription immediately if paid, so the user does not have to wait for the webhook.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateUser(req);
    const sessionId = req.nextUrl.searchParams.get('session_id');
    if (!sessionId || !sessionId.startsWith('cs_')) {
      return NextResponse.json({ error: 'Validation Error', message: 'session_id is required' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata?.userId !== auth.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (session.status === 'complete' && session.payment_status === 'paid' && session.subscription) {
      const tier = await syncStripeSubscription(
        typeof session.subscription === 'string' ? session.subscription : session.subscription.id
      );
      return NextResponse.json({ status: 'paid', tier });
    }

    return NextResponse.json({
      status: session.status === 'expired' ? 'expired' : 'pending',
      tier: null,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    console.error('Stripe session lookup error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
