import { NextRequest, NextResponse } from 'next/server';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '@/src/db';
import { examThemes, examTopics, userQuotas } from '@/src/db/schema';
import { authenticateUser, AuthenticationError } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate user
    const user = await authenticateUser(req);
    const userId = user.userId;

    // 2. Parse optional level query parameter
    const levelParam = req.nextUrl.searchParams.get('level');
    if (levelParam && levelParam !== 'B1' && levelParam !== 'B2') {
      return NextResponse.json(
        { error: "Invalid level query parameter. Must be 'B1' or 'B2'." },
        { status: 400 }
      );
    }

    // 3. Query active themes that contain active question sets (optionally filtered by level)
    const topicConditions = [eq(examTopics.isActive, true), eq(examThemes.isActive, true)];
    if (levelParam) {
      topicConditions.push(eq(examTopics.level, levelParam as 'B1' | 'B2'));
    }

    const rows = await db
      .select({ theme: examThemes, level: examTopics.level })
      .from(examTopics)
      .innerJoin(examThemes, eq(examTopics.themeId, examThemes.id))
      .where(and(...topicConditions))
      .orderBy(asc(examThemes.sortOrder), asc(examThemes.titleNo));

    const themesById = new Map<
      string,
      {
        id: string;
        slug: string;
        titleNo: string;
        descriptionNo: string | null;
        setCounts: { B1: number; B2: number };
      }
    >();
    for (const { theme, level } of rows) {
      let entry = themesById.get(theme.id);
      if (!entry) {
        entry = {
          id: theme.id,
          slug: theme.slug,
          titleNo: theme.titleNo,
          descriptionNo: theme.descriptionNo,
          setCounts: { B1: 0, B2: 0 },
        };
        themesById.set(theme.id, entry);
      }
      entry.setCounts[level] += 1;
    }
    const themes = [...themesById.values()];

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

    // 5. Return themes and quota
    return NextResponse.json({
      themes,
      quota: {
        remainingAudioSeconds: quota ? quota.remainingAudioSeconds : 1800,
        totalCostUsd: quota ? quota.totalCostUsd : '0',
      },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: 'Authentication required' }, { status: 401 });
    }
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

