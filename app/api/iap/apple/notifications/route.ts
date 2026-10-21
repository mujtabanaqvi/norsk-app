import { NextRequest, NextResponse } from 'next/server';
import { verifyAppleNotification, verifyAppleRenewalInfo, verifyAppleTransaction } from '@/lib/iap/apple';
import { syncAppleTransaction } from '@/lib/iap/apple-sync';

/**
 * App Store Server Notifications V2 (configure this URL in App Store Connect for sandbox and production).
 * Every notification carries the latest signed transaction, so we simply re-sync from it.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const signedPayload: string | undefined = body?.signedPayload;
  if (!signedPayload) {
    return NextResponse.json({ error: 'Missing signedPayload' }, { status: 400 });
  }

  let notification;
  try {
    notification = await verifyAppleNotification(signedPayload);
  } catch (err) {
    console.error('Apple notification verification failed:', err);
    return NextResponse.json({ error: 'Invalid notification' }, { status: 400 });
  }

  try {
    const signedTransaction = notification.data?.signedTransactionInfo;
    if (signedTransaction) {
      const tx = await verifyAppleTransaction(signedTransaction);
      const signedRenewal = notification.data?.signedRenewalInfo;
      const renewal = signedRenewal ? await verifyAppleRenewalInfo(signedRenewal) : null;
      await syncAppleTransaction(tx, renewal);
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    // Non-2xx makes Apple retry the notification later.
    console.error(`Error handling Apple notification ${notification.notificationType}:`, error);
    return NextResponse.json({ error: 'Notification processing error' }, { status: 500 });
  }
}

