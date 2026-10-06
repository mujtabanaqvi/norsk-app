import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/src/db';
import { examTopics, userQuotas } from '@/src/db/schema';
import { authenticateUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate user (or extract user identifier)
    let userId: string;
    try {
      const user = await authenticateUser(req);
      userId = user.userId;
    } catch {
      // Allow fallback to ?userId= query param or x-user-id header
      const queryUserId = req.nextUrl.searchParams.get('userId') || req.headers.get('x-user-id');
      if (!queryUserId) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'Authentication required' },
          { status: 401 }
        );
      }
      userId = queryUserId.trim();
    }

    // 2. Parse optional level query parameter
    const levelParam = req.nextUrl.searchParams.get('level');
    if (levelParam && levelParam !== 'B1' && levelParam !== 'B2') {
      return NextResponse.json(
        { error: "Invalid level query parameter. Must be 'B1' or 'B2'." },
        { status: 400 }
      );
    }

    // 3. Query active examTopics (optionally filtered by level)
    const topicConditions = [eq(examTopics.isActive, true)];
    if (levelParam) {
      topicConditions.push(eq(examTopics.level, levelParam as 'B1' | 'B2'));
    }

    const topics = await db
      .select()
      .from(examTopics)
      .where(and(...topicConditions));

    // 4. Fetch or initialize user quota row (default 1800s if none exists)
    let [quota] = await db
      .select()
      .from(userQuotas)
      .where(eq(userQuotas.userId, userId))
      .limit(1);

    if (!quota) {
      const [inserted] = await db
        .insert(userQuotas)
        .values({
          userId,
          remainingAudioSeconds: 1800,
          totalLlmTokensUsed: 0,
          totalTtsCharactersUsed: 0,
          totalSttSecondsUsed: '0',
          totalCostUsd: '0',
        })
        .onConflictDoNothing()
        .returning();

      quota = inserted;
      if (!quota) {
        [quota] = await db
          .select()
          .from(userQuotas)
          .where(eq(userQuotas.userId, userId))
          .limit(1);
      }
    }

    // 5. Return topics and quota
    return NextResponse.json({
      topics,
      quota: {
        remainingAudioSeconds: quota ? quota.remainingAudioSeconds : 1800,
        totalCostUsd: quota ? quota.totalCostUsd : '0',
      },
    });
  } catch (error) {
    console.error('[GET /api/exam/topics] Internal Error:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

