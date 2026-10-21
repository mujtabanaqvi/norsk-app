import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateUser, AuthenticationError } from '@/lib/auth';
import { verifyAppleTransaction } from '@/lib/iap/apple';
import { syncAppleTransaction } from '@/lib/iap/apple-sync';
import { IapOwnershipError } from '@/lib/entitlements';

const verifySchema = z.object({
  /** StoreKit 2 JWS transaction (expo-iap `purchase.purchaseToken` on iOS). */
  signedTransaction: z.string().min(20),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateUser(req);
    const parsed = verifySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation Error', details: parsed.error.flatten() }, { status: 400 });
    }

    let tx;
    try {
      tx = await verifyAppleTransaction(parsed.data.signedTransaction);
    } catch (err) {
      console.error('Apple transaction verification failed:', err);
      return NextResponse.json({ error: 'Invalid transaction' }, { status: 400 });
    }

    const result = await syncAppleTransaction(tx, null, auth.userId);
    if (!result) {
      return NextResponse.json({ error: 'Unrecognized transaction' }, { status: 400 });
    }
    return NextResponse.json({ tier: result.tier });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    if (error instanceof IapOwnershipError) {
      return NextResponse.json({ error: 'Forbidden', code: 'OWNED_BY_OTHER_ACCOUNT', message: error.message }, { status: 403 });
    }
    console.error('Apple verify error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
