import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder_key';

export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2025-02-24.acacia' as any,
  typescript: true,
});

/** Only allow Checkout to return to our own origins, so this endpoint cannot be used as an open redirect. */
export function isAllowedReturnUrl(url: string, allowedOrigins: string[]): boolean {
  try {
    return allowedOrigins.includes(new URL(url).origin);
  } catch {
    return false;
  }
}
