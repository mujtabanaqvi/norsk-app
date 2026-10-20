import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { examSessions, examThemes, examTopics, learningProfiles } from '@/src/db/schema';
import { authenticateUser, AuthenticationError } from '@/lib/auth';
import { updateLearningProfile } from '@/src/lib/learning-profile';
import { toHistoryItem } from '@/src/lib/learning-profile-stats';
import type { LearningProfileResponse } from '@/src/types/learning-profile';

/**
 * GET /api/learning-profile
 * The user's completed exams (newest first) plus their rolling learning insight.
 * `?refresh=1` forces the insight to be regenerated.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    const refresh = req.nextUrl.searchParams.get('refresh') === '1';

    const rows = await db
      .select({
        id: examSessions.id,
        level: examSessions.level,
        coCandidateMode: examSessions.coCandidateMode,
        startedAt: examSessions.startedAt,
        completedAt: examSessions.completedAt,
        evaluationJson: examSessions.evaluationJson,
        engineState: examSessions.engineState,
        topicTitle: examTopics.titleNo,
        themeTitle: examThemes.titleNo,
      })
      .from(examSessions)
      .leftJoin(examTopics, eq(examSessions.topicId, examTopics.id))
      .leftJoin(examThemes, eq(examSessions.themeId, examThemes.id))
      .where(and(eq(examSessions.userId, user.userId), eq(examSessions.status, 'COMPLETED')))
      .orderBy(desc(examSessions.completedAt));

    const history = rows.map((r) =>
      toHistoryItem({
        ...r,
        title: r.engineState?.selectedPrompts?.titleNo || r.topicTitle || null,
        themeTitleNo: r.themeTitle ?? null,
      })
    );

    let [profile] = await db
      .select()
      .from(learningProfiles)
      .where(eq(learningProfiles.userId, user.userId))
      .limit(1);

    // Generate lazily for users whose exams predate the profile, or on explicit refresh
    const hasEvaluated = history.some((h) => !h.pending && !h.insufficientData);
    if (hasEvaluated && (refresh || !profile)) {
      const updated = await updateLearningProfile(user.userId);
      if (updated) {
        profile = {
          userId: user.userId,
          insightJson: updated.insight,
          basedOnSessionIds: updated.basedOnSessionIds,
          updatedAt: updated.updatedAt,
        };
      }
    }

    const body: LearningProfileResponse = {
      insight: profile?.insightJson ?? null,
      basedOnSessionIds: profile?.basedOnSessionIds ?? [],
      updatedAt: profile?.updatedAt ? profile.updatedAt.toISOString() : null,
      history,
    };
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    console.error('[GET /api/learning-profile] Internal Error:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
