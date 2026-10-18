import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import { db } from '@/src/db';
import { users, account, userQuotas, referralRewards } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { signUserToken } from '@/lib/auth';
import { getReferralSettings } from '@/lib/tier-policy';

const googleAuthSchema = z.object({
  idToken: z.string().min(10, 'Google ID Token er påkrevd'),
  referralCode: z.string().trim().optional(),
});

function generateReferralCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = googleAuthSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation Error', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { idToken, referralCode } = parsed.data;
    const clientId = process.env.GOOGLE_CLIENT_ID;

    let payload: { sub: string; email?: string; name?: string; picture?: string };

    if (clientId && clientId !== 'placeholder-google-client-id') {
      const client = new OAuth2Client(clientId);
      const ticket = await client.verifyIdToken({
        idToken,
        audience: clientId,
      });
      const googlePayload = ticket.getPayload();
      if (!googlePayload || !googlePayload.email) {
        return NextResponse.json({ error: 'Invalid Google Token payload' }, { status: 401 });
      }
      payload = {
        sub: googlePayload.sub,
        email: googlePayload.email,
        name: googlePayload.name,
        picture: googlePayload.picture,
      };
    } else {
      // Dev fallback: decode JWT payload
      try {
        const parts = idToken.split('.');
        if (parts.length === 3) {
          const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
          payload = {
            sub: decoded.sub || `google_${Date.now()}`,
            email: decoded.email || 'user@example.com',
            name: decoded.name || 'Google Bruker',
            picture: decoded.picture,
          };
        } else {
          return NextResponse.json(
            { error: 'Invalid token format', message: 'Ugyldig Google token format' },
            { status: 400 }
          );
        }
      } catch {
        return NextResponse.json({ error: 'Failed to parse Google token' }, { status: 400 });
      }
    }

    const googleId = payload.sub;
    const email = payload.email!.toLowerCase().trim();
    const name = payload.name;
    const avatarUrl = payload.picture;

    // 1. Check if OAuth account link already exists
    const [existingAccount] = await db
      .select()
      .from(account)
      .where(
        and(
          eq(account.providerId, 'google'),
          eq(account.accountId, googleId)
        )
      )
      .limit(1);

    let userId: string;
    let userRecord: any;

    if (existingAccount) {
      userId = existingAccount.userId;
      const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      userRecord = u;
    } else {
      // 2. Check if a user with this email exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser) {
        userId = existingUser.id;
        userRecord = existingUser;
      } else {
        // 3. Create new user with referral tracking
        let referrerUserId: string | null = null;
        if (referralCode) {
          const [referrer] = await db
            .select()
            .from(users)
            .where(eq(users.referralCode, referralCode.toUpperCase()))
            .limit(1);

          if (referrer) {
            referrerUserId = referrer.id;
          }
        }

        userId = `usr_${crypto.randomUUID()}`;
        const newReferralCode = generateReferralCode();

        const [createdUser] = await db
          .insert(users)
          .values({
            id: userId,
            email,
            name: name || email.split('@')[0],
            image: avatarUrl,
            referralCode: newReferralCode,
            referredByUserId: referrerUserId,
            subscriptionTier: 'FREE',
          })
          .returning();

        userRecord = createdUser;

        // Initialize user audio quota
        await db
          .insert(userQuotas)
          .values({
            userId,
            remainingAudioSeconds: 1800,
          })
          .onConflictDoNothing();

        // Award referral bonus to referrer
        if (referrerUserId) {
          const referralSettings = await getReferralSettings();
          const startsAt = new Date();
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + referralSettings.durationDays);

          await db.insert(referralRewards).values({
            referrerUserId,
            referredUserId: userId,
            bonusTestsPerDay: referralSettings.bonusDailyTests,
            startsAt,
            expiresAt,
          });
        }
      }

      // Link Google account to the user
      await db
        .insert(account)
        .values({
          id: `acc_${crypto.randomUUID()}`,
          userId,
          providerId: 'google',
          accountId: googleId,
        })
        .onConflictDoNothing();
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
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
