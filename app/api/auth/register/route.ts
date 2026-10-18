import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { auth } from '@/lib/better-auth';
import { db } from '@/src/db';
import { users, referralRewards, userQuotas } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { signUserToken } from '@/lib/auth';
import { getReferralSettings } from '@/lib/tier-policy';

const registerSchema = z.object({
  email: z.string().email('Ugyldig e-postadresse'),
  password: z.string().min(6, 'Passordet må ha minst 6 tegn'),
  name: z.string().min(1, 'Navn er påkrevd').optional(),
  referralCode: z.string().trim().optional(),
});

function generateReferralCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation Error', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { email, password, name, referralCode } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Check referral code if provided
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

    const newReferralCode = generateReferralCode();

    // Use Better Auth to register the user with password hashing & account creation
    const signUpRes = await auth.api.signUpEmail({
      body: {
        email: normalizedEmail,
        password,
        name: name || normalizedEmail.split('@')[0],
      },
    });

    if (!signUpRes || !signUpRes.user) {
      return NextResponse.json(
        { error: 'Registration Failed', message: 'Kunne ikke opprette brukerkonto' },
        { status: 400 }
      );
    }

    const createdUserId = signUpRes.user.id;

    // Update custom referral & tier fields on the user
    await db
      .update(users)
      .set({
        referralCode: newReferralCode,
        referredByUserId: referrerUserId,
        subscriptionTier: 'FREE',
      })
      .where(eq(users.id, createdUserId));

    // Initialize default audio quota
    await db
      .insert(userQuotas)
      .values({
        userId: createdUserId,
        remainingAudioSeconds: 1800,
      })
      .onConflictDoNothing();

    // If referred by another user, award referral bonus tests to the referrer
    if (referrerUserId) {
      const referralSettings = await getReferralSettings();
      const startsAt = new Date();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + referralSettings.durationDays);

      await db.insert(referralRewards).values({
        referrerUserId,
        referredUserId: createdUserId,
        bonusTestsPerDay: referralSettings.bonusDailyTests,
        startsAt,
        expiresAt,
      });
    }

    const token = signUserToken({
      id: createdUserId,
      email: signUpRes.user.email,
      role: 'USER',
    });

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: createdUserId,
        email: signUpRes.user.email,
        name: signUpRes.user.name,
        role: 'USER',
        subscriptionTier: 'FREE',
        referralCode: newReferralCode,
      },
    });
  } catch (error: any) {
    if (error?.message?.includes('already exists') || error?.code === '23505') {
      return NextResponse.json(
        { error: 'Email Already Registered', message: 'En bruker med denne e-postadressen eksisterer allerede' },
        { status: 409 }
      );
    }
    console.error('Registration error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
