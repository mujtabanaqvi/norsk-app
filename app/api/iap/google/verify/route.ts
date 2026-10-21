import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateUser, AuthenticationError } from '@/lib/auth';
import { IapOwnershipError } from '@/lib/entitlements';
import { syncGooglePurchase } from '@/lib/iap/google-sync';

const verifySchema = z.object({
  purchaseToken: z.string().min(10),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateUser(req);
    const parsed = verifySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation Error', details: parsed.error.flatten() }, { status: 400 });
    }

    const result = await syncGooglePurchase(parsed.data.purchaseToken, auth.userId);
    if (!result) {
      return NextResponse.json({ error: 'Unrecognized purchase' }, { status: 400 });
    }
    return NextResponse.json({ tier: result.tier });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    if (error instanceof IapOwnershipError) {
      return NextResponse.json({ error: 'Forbidden', code: 'OWNED_BY_OTHER_ACCOUNT', message: error.message }, { status: 403 });
    }
    console.error('Google verify error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
