import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { authenticateUser, AuthenticationError } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { getTierConfigs } from '@/lib/tier-policy';
import { DEFAULT_LOCALE, translate } from '@/src/i18n';

const checkoutSchema = z.object({
  tier: z.enum(['STANDARD', 'PREMIUM']),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  /** UI language of the app, used for Stripe's checkout page and our return pages. */
  locale: z.enum(['nb', 'en']).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateUser(req);
    const body = await req.json().catch(() => ({}));
    const parsed = checkoutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation Error', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { tier, successUrl, cancelUrl, locale = DEFAULT_LOCALE } = parsed.data;

    // Fetch user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const tierConfigs = await getTierConfigs();
    const selectedPlan = tierConfigs[tier];

    // Find or create Stripe Customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: {
          userId: user.id,
        },
      });
      customerId = customer.id;

      await db
        .update(users)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(users.id, user.id));
    }

    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const langQuery = locale === DEFAULT_LOCALE ? '' : `lang=${locale}`;
    const finalSuccessUrl =
      successUrl ||
      `${origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}${langQuery ? `&${langQuery}` : ''}`;
    const finalCancelUrl = cancelUrl || `${origin}/subscription/canceled${langQuery ? `?${langQuery}` : ''}`;

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      locale,
      line_items: [
        {
          price_data: {
            currency: selectedPlan.currency.toLowerCase(),
            product_data: {
              name: translate(locale, 'web.stripeProductName', {
                tier: tier === 'STANDARD' ? 'Standard' : 'Premium',
              }),
              description: translate(locale, 'web.stripeProductDescription', {
                count: selectedPlan.dailyTestLimit,
              }),
            },
            unit_amount: selectedPlan.priceCents,
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: user.id,
        tier,
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          tier,
        },
      },
      success_url: finalSuccessUrl,
      cancel_url: finalCancelUrl,
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    console.error('Stripe Checkout Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
