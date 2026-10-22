import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { authenticateUser, AuthenticationError } from '@/lib/auth';
import { stripe, isAllowedReturnUrl } from '@/lib/stripe';
import { DEFAULT_LOCALE } from '@/src/i18n';

const portalSchema = z.object({
  returnUrl: z.string().url().optional(),
  /** UI language of the app, used for Stripe's portal page. */
  locale: z.enum(['nb', 'en']).optional(),
});

/**
 * Opens the Stripe Customer Portal, where web subscribers (including Android users, who subscribe on the web)
 * cancel or update their card. Changes come back through the webhook (`customer.subscription.updated/deleted`).
 * Plan switching must stay disabled in the portal configuration: the tier is read from subscription metadata.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateUser(req);
    const body = await req.json().catch(() => ({}));
    const parsed = portalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation Error', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { returnUrl, locale = DEFAULT_LOCALE } = parsed.data;

    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const allowedOrigins = [origin, process.env.NEXT_PUBLIC_APP_URL]
      .filter((o): o is string => Boolean(o))
      .map((o) => new URL(o).origin);
    if (returnUrl && !isAllowedReturnUrl(returnUrl, allowedOrigins)) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'Return URL must point to this app' },
        { status: 400 }
      );
    }

    const [user] = await db
      .select({ stripeCustomerId: users.stripeCustomerId })
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (!user.stripeCustomerId) {
      return NextResponse.json(
        { error: 'Not Found', code: 'NO_STRIPE_CUSTOMER', message: 'No web subscription found for this account' },
        { status: 404 }
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl || `${origin}/subscription`,
      locale,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    console.error('Stripe Portal Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
