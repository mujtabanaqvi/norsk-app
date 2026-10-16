import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { examTopics, examSessions } from '@/src/db/schema';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { slugifyNorwegianTitle } from '@/src/server/exam-randomizer';

export const createExamSchema = z.object({
  titleNo: z.string().trim().min(3, 'Tittel må være minst 3 tegn.'),
  slug: z.string().trim().optional(),
  level: z.enum(['B1', 'B2']),
  monologuePromptNo: z
    .string()
    .trim()
    .min(10, 'Del 1 monologoppgave må være minst 10 tegn.'),
  discussionPromptNo: z
    .string()
    .trim()
    .min(10, 'Del 2 samtaleoppgave må være minst 10 tegn.'),
  followUpQuestionsNo: z
    .array(z.string().trim().min(5, 'Hvert oppfølgingsspørsmål må være minst 5 tegn.'))
    .min(1, 'Legg til minst ett oppfølgingsspørsmål for Del 3.'),
  isActive: z.boolean().optional().default(true),
});

export async function GET(req: NextRequest) {
  const auth = verifyAdminRequest(req);
  if (!auth.authorized) {
    return auth.errorResponse!;
  }

  try {
    const topics = await db
      .select()
      .from(examTopics)
      .orderBy(desc(examTopics.createdAt));

    const sessionCounts = await db
      .select({
        topicId: examSessions.topicId,
        count: sql<number>`count(*)::int`,
      })
      .from(examSessions)
      .groupBy(examSessions.topicId);

    const countByTopicId = new Map<string, number>();
    for (const row of sessionCounts) {
      if (row.topicId) {
        countByTopicId.set(row.topicId, Number(row.count) || 0);
      }
    }

    const enrichedTopics = topics.map((topic) => ({
      ...topic,
      sessionCount: countByTopicId.get(topic.id) ?? 0,
    }));

    return NextResponse.json({ exams: enrichedTopics }, { status: 200 });
  } catch (error) {
    console.error('[GET /api/admin/exams] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = verifyAdminRequest(req);
  if (!auth.authorized) {
    return auth.errorResponse!;
  }

  try {
    let rawJson: unknown;
    try {
      rawJson = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    const parsed = createExamSchema.safeParse(rawJson);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validering feilet',
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const {
      titleNo,
      slug: rawSlug,
      level,
      monologuePromptNo,
      discussionPromptNo,
      followUpQuestionsNo,
      isActive,
    } = parsed.data;

    let baseSlug = slugifyNorwegianTitle(rawSlug && rawSlug.length > 0 ? rawSlug : titleNo);

    // Ensure slug uniqueness
    const existingWithSlug = await db
      .select({ id: examTopics.id })
      .from(examTopics)
      .where(eq(examTopics.slug, baseSlug))
      .limit(1);

    if (existingWithSlug.length > 0) {
      baseSlug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const [created] = await db
      .insert(examTopics)
      .values({
        titleNo,
        slug: baseSlug,
        level,
        monologuePromptNo,
        discussionPromptNo,
        followUpQuestionsNo,
        isActive: isActive ?? true,
      })
      .returning();

    return NextResponse.json(
      {
        exam: {
          ...created,
          sessionCount: 0,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[POST /api/admin/exams] Error:', error);
    return NextResponse.json(
      {
        error: 'Kunne ikke opprette eksamen',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

