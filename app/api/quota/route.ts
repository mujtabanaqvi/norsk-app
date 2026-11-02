import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { userQuotas } from '@/src/db/schema';
import { authenticateUser, AuthenticationError } from '@/lib/auth';
import { verifyAdminRequest } from '@/lib/admin-auth';
import {
  getUserAudioStatus,
  getUserDailyTestStatus,
  recordAudioUsage,
  MIN_AUDIO_SECONDS_TO_START,
} from '@/lib/tier-policy';

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

    const dailyTestStatus = await getUserDailyTestStatus(user.userId);
    const audioStatus = await getUserAudioStatus(user.userId, dailyTestStatus.tier);

    return NextResponse.json({
      userId: user.userId,
      remainingAudioSeconds: audioStatus.remainingAudioSeconds,
      remainingSeconds: audioStatus.remainingAudioSeconds,
      dailyAudioSeconds: audioStatus.dailyAudioSeconds,
      audioUsedTodaySeconds: audioStatus.usedTodaySeconds,
      audioResetsAtIso: audioStatus.resetsAtIso,
      totalLlmTokensUsed: quota?.totalLlmTokensUsed ?? 0,
      totalTokensUsed: quota?.totalLlmTokensUsed ?? 0,
      totalCostUsd: quota?.totalCostUsd ?? '0.000000',
      // Kept for older app builds, which skip the speaking-time check when this is true
      audioUnlimited: false,
      hasSufficientQuotaForExam:
        audioStatus.remainingAudioSeconds >= MIN_AUDIO_SECONDS_TO_START && dailyTestStatus.canStartTest,
      dailyTestStatus,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Admin-only top-up of a user's speaking seconds for today (e.g. support credit)
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

    // Extra speaking time for today only; it goes away with the midnight reset
    await recordAudioUsage(userId, -additionalSeconds);
    const { remainingAudioSeconds } = await getUserAudioStatus(userId);

    return NextResponse.json({
      success: true,
      userId,
      remainingAudioSeconds,
      remainingSeconds: remainingAudioSeconds,
    });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
