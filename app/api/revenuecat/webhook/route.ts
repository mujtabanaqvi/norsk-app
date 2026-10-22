import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { isRevenueCatAnonymousId, syncRevenueCatSubscriber } from '@/lib/revenuecat';

function isAuthorized(header: string | null, expected: string): boolean {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * RevenueCat webhook (purchases, renewals, cancellations, expirations, billing issues and transfers on every store).
 * The event body only tells us *which* users changed: each one is re-synced from RevenueCat's API, so retried or
 * out-of-order events always converge on the current state.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected) {
    console.error('REVENUECAT_WEBHOOK_AUTH is not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }
  if (!isAuthorized(req.headers.get('authorization'), expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const event = body?.event;
  if (!event) {
    return NextResponse.json({ error: 'Validation Error', message: 'Missing event' }, { status: 400 });
  }

  const appUserIds = new Set<string>(
    [event.app_user_id, ...(event.transferred_from ?? []), ...(event.transferred_to ?? [])].filter(
      (id: unknown): id is string => typeof id === 'string' && !isRevenueCatAnonymousId(id)
    )
  );

  try {
    for (const userId of appUserIds) {
      await syncRevenueCatSubscriber(userId);
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    // A non-2xx response makes RevenueCat retry the event later.
    console.error(`RevenueCat webhook (${event.type}) failed:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
