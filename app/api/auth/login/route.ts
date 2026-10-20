import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/better-auth';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { signUserToken } from '@/lib/auth';
import { loginSchema } from '@/src/validation/auth';
import { apiError, validationError, betterAuthErrorCode } from '@/lib/api-errors';
import { issueVerification } from '@/lib/email-verification';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { email, password } = parsed.data;

  try {
    // Authenticate via Better Auth (rejects unverified emails with EMAIL_NOT_VERIFIED)
    const signInRes = await auth.api.signInEmail({
      body: {
        email,
        password,
      },
    });

    if (!signInRes || !signInRes.user) {
      return apiError(401, 'INVALID_CREDENTIALS', 'Feil e-post eller passord');
    }

    const [userRecord] = await db
      .select()
      .from(users)
      .where(eq(users.id, signInRes.user.id))
      .limit(1);

    const token = signUserToken({
      id: signInRes.user.id,
      email: signInRes.user.email,
      role: userRecord?.role || 'USER',
    });

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: signInRes.user.id,
        email: signInRes.user.email,
        name: signInRes.user.name,
        role: userRecord?.role || 'USER',
        subscriptionTier: userRecord?.subscriptionTier || 'FREE',
        referralCode: userRecord?.referralCode,
      },
    });
  } catch (error: any) {
    const code = betterAuthErrorCode(error);

    if (code.includes('EMAIL_NOT_VERIFIED')) {
      // Password was correct (Better Auth checks it first) — send a fresh code, respecting the cooldown.
      let retryAfterSeconds: number | undefined;
      try {
        const [userRecord] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (userRecord) {
          const issued = await issueVerification(userRecord);
          if (!issued.sent) retryAfterSeconds = issued.retryAfterSeconds;
        }
      } catch (emailError) {
        console.error('Failed to re-send verification email on login:', emailError);
      }
      return apiError(403, 'EMAIL_NOT_VERIFIED', 'Du må bekrefte e-postadressen din før du kan logge inn.', {
        email,
        ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
      });
    }

    if (code.includes('INVALID_EMAIL_OR_PASSWORD') || code.includes('Invalid')) {
      return apiError(401, 'INVALID_CREDENTIALS', 'Feil e-post eller passord');
    }

    console.error('Login error:', error);
    return apiError(500, 'LOGIN_ERROR', 'Innlogging mislyktes. Prøv igjen senere.');
  }
}
