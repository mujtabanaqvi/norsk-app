import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { resendVerificationSchema } from '@/src/validation/auth';
import { apiError, validationError } from '@/lib/api-errors';
import { issueVerification } from '@/lib/email-verification';
import { RESEND_COOLDOWN_SECONDS } from '@/lib/verification-codes';

/**
 * POST { email } — send a new verification code + link.
 * Responds identically whether or not the account exists, to avoid email enumeration.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = resendVerificationSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const { email } = parsed.data;
    const [userRecord] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (userRecord && !userRecord.emailVerified) {
      const issued = await issueVerification(userRecord);
      if (!issued.sent) {
        return apiError(
          429,
          'RESEND_COOLDOWN',
          `Vent ${issued.retryAfterSeconds} sekunder før du ber om en ny kode.`,
          { retryAfterSeconds: issued.retryAfterSeconds }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Hvis kontoen venter på bekreftelse, har vi sendt en ny kode.',
      retryAfterSeconds: RESEND_COOLDOWN_SECONDS,
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    return apiError(500, 'EMAIL_SEND_FAILED', 'Kunne ikke sende e-post. Prøv igjen senere.');
  }
}
