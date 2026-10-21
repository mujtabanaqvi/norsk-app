import { NextRequest, NextResponse } from 'next/server';
import { GOOGLE_PLAY_PACKAGE_NAME, verifyPubSubPushToken } from '@/lib/iap/google';
import { syncGooglePurchase } from '@/lib/iap/google-sync';

/**
 * Google Play Real-Time Developer Notifications, delivered by a Pub/Sub push subscription
 * with OIDC authentication (audience = GOOGLE_RTDN_AUDIENCE).
 * Notifications only say "something changed"; the current state is always re-fetched from Play.
 */
export async function POST(req: NextRequest) {
  if (!(await verifyPubSubPushToken(req.headers.get('authorization')))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const data = body?.message?.data;
  if (!data) {
    return NextResponse.json({ error: 'Missing message data' }, { status: 400 });
  }

  let notification: any;
  try {
    notification = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
  } catch {
    // Malformed messages are acknowledged so Pub/Sub does not redeliver them forever.
    return NextResponse.json({ received: true });
  }

  const purchaseToken: string | undefined = notification?.subscriptionNotification?.purchaseToken;
  if (notification?.packageName !== GOOGLE_PLAY_PACKAGE_NAME || !purchaseToken) {
    return NextResponse.json({ received: true });
  }

  try {
    await syncGooglePurchase(purchaseToken);
    return NextResponse.json({ received: true });
  } catch (error) {
    // Non-2xx makes Pub/Sub retry delivery.
    console.error('Error handling Google RTDN:', error);
    return NextResponse.json({ error: 'Notification processing error' }, { status: 500 });
  }
}
