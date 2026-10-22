import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, AuthenticationError } from '@/lib/auth';
import { syncRevenueCatSubscriber } from '@/lib/revenuecat';

/**
 * Called by the app right after a purchase or restore so the new tier applies immediately,
 * without waiting for the RevenueCat webhook. Only ever syncs the caller's own subscriptions.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateUser(req);
    const tier = await syncRevenueCatSubscriber(auth.userId);
    if (!tier) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({ tier });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    console.error('RevenueCat Sync Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
