import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateUser, AuthenticationError } from '@/lib/auth';
import { PromoCodeError, redeemPromoCode, type PromoErrorCode } from '@/lib/promo-codes';

export const redeemPromoSchema = z.object({
  code: z.string().trim().min(1).max(64),
});

const ERROR_STATUS: Record<PromoErrorCode, number> = {
  INVALID_CODE: 400,
  NOT_FOUND: 404,
  INACTIVE: 404,
  NOT_STARTED: 409,
  EXPIRED: 410,
  EXHAUSTED: 410,
  ALREADY_REDEEMED: 409,
  ALREADY_HAS_TIER: 409,
  UNSUPPORTED_DISCOUNT: 409,
};

/** Redeems a promo code for the caller: grants its tier for its duration, no payment involved. */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateUser(req);

    let rawJson: unknown;
    try {
      rawJson = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const parsed = redeemPromoSchema.safeParse(rawJson);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'INVALID_CODE', issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const result = await redeemPromoCode(auth.userId, parsed.data.code);
    return NextResponse.json({
      tier: result.tier,
      grantedTier: result.grantedTier,
      expiresAt: result.expiresAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    if (error instanceof PromoCodeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: ERROR_STATUS[error.code] });
    }
    console.error('Promo Redeem Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
