import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { auth } from '@/lib/better-auth';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { registerSchema } from '@/src/validation/auth';
import { apiError, validationError, betterAuthErrorCode } from '@/lib/api-errors';
import { issueVerification } from '@/lib/email-verification';

function generateReferralCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function verificationPending(email: string, retryAfterSeconds?: number) {
  return NextResponse.json({
    success: true,
    requiresVerification: true,
    email,
    ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const { email, password, name, referralCode } = parsed.data;

    const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser) {
      // Let a user who never finished verification get a fresh code instead of a dead end.
      if (!existingUser.emailVerified) {
        const issued = await issueVerification(existingUser);
        return verificationPending(email, issued.sent ? undefined : issued.retryAfterSeconds);
      }
      return apiError(409, 'EMAIL_TAKEN', 'En bruker med denne e-postadressen eksisterer allerede', {
        fieldErrors: { email: 'E-postadressen er allerede registrert. Prøv å logge inn.' },
      });
    }

    let referrerUserId: string | null = null;
    if (referralCode) {
      const [referrer] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.referralCode, referralCode))
        .limit(1);

      if (!referrer) {
        return apiError(400, 'INVALID_REFERRAL_CODE', 'Vervekoden finnes ikke', {
          fieldErrors: { referralCode: 'Vervekoden finnes ikke' },
        });
      }
      referrerUserId = referrer.id;
    }

    const newReferralCode = generateReferralCode();

    // Better Auth hashes the password and creates the credential account.
    // requireEmailVerification is on, so no session is created here.
    const signUpRes = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
        referralCode: newReferralCode,
        referredByUserId: referrerUserId,
        role: 'USER',
        subscriptionTier: 'FREE',
      },
    });

    if (!signUpRes || !signUpRes.user) {
      return apiError(400, 'REGISTRATION_FAILED', 'Kunne ikke opprette brukerkonto');
    }

    const createdUser = signUpRes.user;

    await db
      .update(users)
      .set({
        referralCode: newReferralCode,
        referredByUserId: referrerUserId,
        subscriptionTier: 'FREE',
      })
      .where(eq(users.id, createdUser.id));

    // Quota and referral reward are granted once the email is verified (see onEmailVerified).
    try {
      await issueVerification({ id: createdUser.id, email, name }, { force: true });
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      return apiError(
        502,
        'EMAIL_SEND_FAILED',
        'Kontoen ble opprettet, men vi kunne ikke sende bekreftelses-e-post. Prøv «Send ny kode».',
        { requiresVerification: true, email }
      );
    }

    return verificationPending(email);
  } catch (error: any) {
    const code = betterAuthErrorCode(error);
    if (code.includes('USER_ALREADY_EXISTS') || code.includes('already exists') || error?.code === '23505') {
      return apiError(409, 'EMAIL_TAKEN', 'En bruker med denne e-postadressen eksisterer allerede', {
        fieldErrors: { email: 'E-postadressen er allerede registrert. Prøv å logge inn.' },
      });
    }
    if (code.includes('PASSWORD_TOO_SHORT') || code.includes('PASSWORD_TOO_LONG')) {
      return apiError(400, 'VALIDATION_ERROR', 'Passordet oppfyller ikke kravene', {
        fieldErrors: { password: 'Passordet oppfyller ikke kravene' },
      });
    }
    console.error('Registration error:', error);
    return apiError(500, 'REGISTRATION_ERROR', 'Registrering mislyktes. Prøv igjen senere.');
  }
}
