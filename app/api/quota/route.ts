import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { userQuotas } from '@/src/db/schema';
import { authenticateUser, AuthenticationError } from '@/lib/auth';

const topUpSchema = z.object({
  additionalSeconds: z.number().int().positive('additionalSeconds must be a positive integer'),
});

// GET: Retrieve current user's quota
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateUser(req);

    const [quota] = await db
      .select()
      .from(userQuotas)
      .where(eq(userQuotas.userId, user.userId))
      .limit(1);

    if (!quota) {
      return NextResponse.json({
        userId: user.userId,
        remainingAudioSeconds: 1800,
        remainingSeconds: 1800,
        totalLlmTokensUsed: 0,
        totalTokensUsed: 0,
        totalCostUsd: '0.000000',
        hasSufficientQuotaForExam: true,
      });
    }

    return NextResponse.json({
      userId: quota.userId,
      remainingAudioSeconds: quota.remainingAudioSeconds,
      remainingSeconds: quota.remainingAudioSeconds,
      totalLlmTokensUsed: quota.totalLlmTokensUsed,
      totalTokensUsed: quota.totalLlmTokensUsed,
      totalCostUsd: quota.totalCostUsd,
      hasSufficientQuotaForExam: quota.remainingAudioSeconds >= 180,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Top-up seconds for user (e.g. after In-App Purchase)
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    const body = await req.json().catch(() => ({}));
    const parsed = topUpSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { additionalSeconds } = parsed.data;

    const [updated] = await db
      .insert(userQuotas)
      .values({
        userId: user.userId,
        remainingAudioSeconds: 1800 + additionalSeconds,
        totalLlmTokensUsed: 0,
        totalCostUsd: '0.000000',
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userQuotas.userId,
        set: {
          remainingAudioSeconds: sql`${userQuotas.remainingAudioSeconds} + ${additionalSeconds}`,
          updatedAt: new Date(),
        },
      })
      .returning();

    return NextResponse.json({
      success: true,
      userId: updated.userId,
      remainingAudioSeconds: updated.remainingAudioSeconds,
      remainingSeconds: updated.remainingAudioSeconds,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
