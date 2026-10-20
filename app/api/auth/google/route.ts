import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import { db } from '@/src/db';
import { users, account, userQuotas } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { signUserToken } from '@/lib/auth';
import { referralCodeSchema } from '@/src/validation/auth';
import { apiError, validationError } from '@/lib/api-errors';
import { onEmailVerified } from '@/lib/email-verification';

const googleAuthSchema = z.object({
  idToken: z.string().min(10, 'Google ID Token er påkrevd'),
  referralCode: referralCodeSchema,
});

function generateReferralCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

/** Every OAuth client ID (web / Android / iOS) whose ID tokens we accept. */
function googleAudiences(): string[] {
  return [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
  ].filter((id): id is string => !!id && id !== 'placeholder-google-client-id');
}

interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity | null> {
  const audiences = googleAudiences();

  if (audiences.length > 0) {
    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({ idToken, audience: audiences });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) return null;
    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      name: payload.name,
      picture: payload.picture,
    };
  }

  // Local development only: no client IDs configured, accept an unsigned JWT payload.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Google client IDs are not configured');
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
  if (!decoded.sub || !decoded.email) return null;
  return {
    sub: decoded.sub,
    email: decoded.email,
    emailVerified: true,
    name: decoded.name,
    picture: decoded.picture,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = googleAuthSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const { idToken, referralCode } = parsed.data;

    let identity: GoogleIdentity | null;
    try {
      identity = await verifyGoogleIdToken(idToken);
    } catch (verifyError) {
      console.warn('Google ID token verification failed:', verifyError);
      return apiError(401, 'INVALID_GOOGLE_TOKEN', 'Google-innloggingen kunne ikke bekreftes. Prøv igjen.');
    }

    if (!identity) {
      return apiError(401, 'INVALID_GOOGLE_TOKEN', 'Google-innloggingen kunne ikke bekreftes. Prøv igjen.');
    }
    if (!identity.emailVerified) {
      return apiError(403, 'GOOGLE_EMAIL_NOT_VERIFIED', 'Google-kontoen din har ikke en bekreftet e-postadresse.');
    }

    const googleId = identity.sub;
    const email = identity.email.toLowerCase().trim();

    // 1. Check if OAuth account link already exists
    const [existingAccount] = await db
      .select()
      .from(account)
      .where(and(eq(account.providerId, 'google'), eq(account.accountId, googleId)))
      .limit(1);

    let userRecord: typeof users.$inferSelect | undefined;

    if (existingAccount) {
      [userRecord] = await db.select().from(users).where(eq(users.id, existingAccount.userId)).limit(1);
    } else {
      // 2. Check if a user with this email exists
      const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);

      if (existingUser) {
        // Link Google to the existing account. We deliberately do NOT flip email_verified for an
        // unverified password account: whoever pre-registered this address with a password must
        // still prove ownership via the email before password login works.
        userRecord = existingUser;
        await db
          .insert(userQuotas)
          .values({ userId: existingUser.id, remainingAudioSeconds: 1800 })
          .onConflictDoNothing();
      } else {
        // 3. Create new user — Google has already verified the email
        let referrerUserId: string | null = null;
        if (referralCode) {
          const [referrer] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.referralCode, referralCode))
            .limit(1);
          referrerUserId = referrer?.id ?? null;
        }

        [userRecord] = await db
          .insert(users)
          .values({
            id: `usr_${crypto.randomUUID()}`,
            email,
            emailVerified: true,
            name: identity.name || email.split('@')[0],
            image: identity.picture,
            referralCode: generateReferralCode(),
            referredByUserId: referrerUserId,
            subscriptionTier: 'FREE',
          })
          .returning();

        await onEmailVerified(userRecord.id);
      }

      await db
        .insert(account)
        .values({
          id: `acc_${crypto.randomUUID()}`,
          userId: userRecord.id,
          providerId: 'google',
          accountId: googleId,
        })
        .onConflictDoNothing();
    }

    if (!userRecord) {
      return apiError(404, 'USER_NOT_FOUND', 'Brukerkontoen finnes ikke');
    }

    const token = signUserToken({
      id: userRecord.id,
      email: userRecord.email,
      role: userRecord.role,
    });

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.name,
        image: userRecord.image,
        role: userRecord.role,
        subscriptionTier: userRecord.subscriptionTier,
        referralCode: userRecord.referralCode,
      },
    });
  } catch (error) {
    console.error('Google Auth Error:', error);
    return apiError(500, 'GOOGLE_AUTH_ERROR', 'Google-innlogging mislyktes. Prøv igjen senere.');
  }
}
