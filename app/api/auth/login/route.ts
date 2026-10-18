import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/better-auth';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { signUserToken } from '@/lib/auth';

const loginSchema = z.object({
  email: z.string().email('Ugyldig e-postadresse'),
  password: z.string().min(1, 'Passord er påkrevd'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation Error', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Authenticate via Better Auth
    const signInRes = await auth.api.signInEmail({
      body: {
        email: normalizedEmail,
        password,
      },
    });

    if (!signInRes || !signInRes.user) {
      return NextResponse.json(
        { error: 'Invalid Credentials', message: 'Ugyldig e-post eller passord' },
        { status: 401 }
      );
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
    const errorMsg = String(error?.body?.message || error?.message || '');
    if (
      errorMsg.includes('Invalid password') ||
      errorMsg.includes('Invalid email') ||
      errorMsg.includes('not found') ||
      errorMsg.includes('INVALID_EMAIL_OR_PASSWORD')
    ) {
      return NextResponse.json(
        { error: 'Invalid Credentials', message: 'Ugyldig e-post eller passord' },
        { status: 401 }
      );
    }
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Login Error', message: error?.body?.message || error?.message || 'Innlogging mislyktes' },
      { status: 500 }
    );
  }
}
