import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { userQuotas } from '@/src/db/schema';
import { authenticateUser, AuthenticationError } from '@/lib/auth';
import { verifyAdminRequest } from '@/lib/admin-auth';

const topUpSchema = z.object({
  userId: z.string().uuid('userId must be a UUID'),
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

    const { getUserDailyTestStatus, hasUnlimitedAudio } = await import('@/lib/tier-policy');
    const dailyTestStatus = await getUserDailyTestStatus(user.userId);
    const audioUnlimited = hasUnlimitedAudio(dailyTestStatus.tier);

    if (!quota) {
      return NextResponse.json({
        userId: user.userId,
        remainingAudioSeconds: 1800,
        remainingSeconds: 1800,
        totalLlmTokensUsed: 0,
        totalTokensUsed: 0,
        totalCostUsd: '0.000000',
        audioUnlimited,
        hasSufficientQuotaForExam: dailyTestStatus.canStartTest,
        dailyTestStatus,
      });
    }

    return NextResponse.json({
      userId: quota.userId,
      remainingAudioSeconds: quota.remainingAudioSeconds,
      remainingSeconds: quota.remainingAudioSeconds,
      totalLlmTokensUsed: quota.totalLlmTokensUsed,
      totalTokensUsed: quota.totalLlmTokensUsed,
      totalCostUsd: quota.totalCostUsd,
      audioUnlimited,
      hasSufficientQuotaForExam:
        (audioUnlimited || quota.remainingAudioSeconds >= 180) && dailyTestStatus.canStartTest,
      dailyTestStatus,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Admin-only top-up of a user's seconds (e.g. support credit)
export async function POST(req: NextRequest) {
  const auth = verifyAdminRequest(req);
  if (!auth.authorized) {
    return auth.errorResponse!;
  }

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = topUpSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { userId, additionalSeconds } = parsed.data;

    const [updated] = await db
      .insert(userQuotas)
      .values({
        userId,
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
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
