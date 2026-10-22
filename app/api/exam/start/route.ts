import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, isNotNull, or } from 'drizzle-orm';
import { db } from '@/src/db';
import {
  examSessions,
  userQuotas,
  examTopics,
  examThemes,
  ExamTopic,
  ExamTheme,
  TranscriptEntry,
  SessionEngineState,
  SelectedExamPrompts,
} from '@/src/db/schema';
import { authenticateUser, AuthenticationError } from '@/lib/auth';
import { initialState, openingActions, toUiStage } from '@/src/server/exam-engine';
import {
  composeExam,
  pickRandomFollowUpQuestions,
} from '@/src/server/exam-randomizer';
import { generateLine } from '@/src/server/personas';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Validates the request body using Zod.
// themeId: theme id/slug, or omit / 'RANDOM' to compose the exam across random themes.
// topicId: legacy (older mobile builds) — a specific question set id/slug.
export const startExamSchema = z.object({
  userId: z.string().optional(),
  themeId: z.string().optional(),
  topicId: z.string().optional(),
  level: z.enum(['B1', 'B2']),
  coCandidateMode: z.enum(['AI_PEER', 'HUMAN_LOCAL']),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user strictly
    const authUser = await authenticateUser(req);
    const userId = authUser.userId;

    // 2. Parse JSON payload
    let rawJson: Record<string, unknown>;
    try {
      rawJson = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    const validationResult = startExamSchema.safeParse(rawJson);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          issues: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { themeId, topicId, level, coCandidateMode } = validationResult.data;

    // 2. Fetch or create user quota row (default 1800s if none exists)
    let [quota] = await db
      .select()
      .from(userQuotas)
      .where(eq(userQuotas.userId, userId))
      .limit(1);

    if (!quota) {
      const [insertedQuota] = await db
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

      quota = insertedQuota;
      if (!quota) {
        [quota] = await db
          .select()
          .from(userQuotas)
          .where(eq(userQuotas.userId, userId))
          .limit(1);
      }
    }

    // Check if remainingAudioSeconds < 180
    const remainingAudioSeconds = quota?.remainingAudioSeconds ?? 0;
    if (remainingAudioSeconds < 180) {
      return NextResponse.json(
        { error: 'Insufficient audio quota remaining.' },
        { status: 402 }
      );
    }

    // Check daily test limit (free tier limit + active referral bonuses vs tests used today)
    const { getUserDailyTestStatus } = await import('@/lib/tier-policy');
    const dailyStatus = await getUserDailyTestStatus(userId);
    if (!dailyStatus.canStartTest) {
      return NextResponse.json(
        {
          error: 'Daily test limit reached',
          message: `Du har nådd din daglige grense på ${dailyStatus.totalAllowedToday} test(er). Grensen nullstilles ved midnatt.`,
          code: 'DAILY_LIMIT_REACHED',
          dailyStatus,
        },
        { status: 403 }
      );
    }

    // 3. Compose the exam: a specific legacy question set, a chosen theme, or random across themes
    let prompts: SelectedExamPrompts;
    let selectedFollowUpQuestionsNo: string[];
    let monologueTopicId: string;
    let chosenTheme: ExamTheme | null = null;

    const trimmedTopicId = topicId?.trim();
    const trimmedThemeId = themeId?.trim();
    const isRandomTheme = !trimmedThemeId || trimmedThemeId.toUpperCase() === 'RANDOM';

    if (trimmedTopicId && trimmedTopicId.toUpperCase() !== 'RANDOM') {
      const topicQuery = UUID_REGEX.test(trimmedTopicId)
        ? or(eq(examTopics.id, trimmedTopicId), eq(examTopics.slug, trimmedTopicId))
        : eq(examTopics.slug, trimmedTopicId);

      const [topic] = await db.select().from(examTopics).where(topicQuery).limit(1);
      if (!topic) {
        return NextResponse.json({ error: 'Topic not found.' }, { status: 404 });
      }

      monologueTopicId = topic.id;
      selectedFollowUpQuestionsNo = pickRandomFollowUpQuestions(topic.followUpQuestionsNo, 3);
      prompts = {
        titleNo: topic.titleNo,
        monologuePromptNo: topic.monologuePromptNo,
        discussionPromptNo: topic.discussionPromptNo,
        monologueTopicId: topic.id,
        discussionTopicId: topic.id,
        followUpThemeIds: topic.themeId ? [topic.themeId] : [],
      };
    } else {
      if (!isRandomTheme) {
        const themeQuery = UUID_REGEX.test(trimmedThemeId)
          ? or(eq(examThemes.id, trimmedThemeId), eq(examThemes.slug, trimmedThemeId))
          : eq(examThemes.slug, trimmedThemeId);

        const [foundTheme] = await db
          .select()
          .from(examThemes)
          .where(and(themeQuery, eq(examThemes.isActive, true)))
          .limit(1);
        if (!foundTheme) {
          return NextResponse.json({ error: 'Theme not found.' }, { status: 404 });
        }
        chosenTheme = foundTheme;
      }

      // Active question sets for this level that belong to an active theme
      const themedSets: ExamTopic[] = (
        await db
          .select({ topic: examTopics })
          .from(examTopics)
          .innerJoin(examThemes, eq(examTopics.themeId, examThemes.id))
          .where(
            and(
              eq(examTopics.level, level),
              eq(examTopics.isActive, true),
              eq(examThemes.isActive, true),
              isNotNull(examTopics.themeId)
            )
          )
      ).map((row) => row.topic);

      let pool = themedSets;
      // Fallback (random only): no themes assigned yet — draw from all active sets for the level
      if (pool.length === 0 && !chosenTheme) {
        pool = await db
          .select()
          .from(examTopics)
          .where(and(eq(examTopics.level, level), eq(examTopics.isActive, true)));
      }

      const composed = composeExam(pool, { themeId: chosenTheme?.id ?? null, followUpCount: 3 });
      if (!composed) {
        return NextResponse.json(
          { error: chosenTheme ? 'No question sets found for this theme and level.' : 'Topic not found.' },
          { status: 404 }
        );
      }

      monologueTopicId = composed.monologueSet.id;
      selectedFollowUpQuestionsNo = composed.followUpQuestionsNo;
      prompts = {
        titleNo: composed.monologueSet.titleNo,
        monologuePromptNo: composed.monologueSet.monologuePromptNo,
        discussionPromptNo: composed.discussionSet.discussionPromptNo,
        monologueTopicId: composed.monologueSet.id,
        discussionTopicId: composed.discussionSet.id,
        followUpThemeIds: composed.followUpThemeIds,
      };
    }

    // 4. Generate initial engine state and opening greeting line
    const engine = initialState();
    const actions = openingActions();
    const transcript: TranscriptEntry[] = [];
    let promptTokens = 0;
    let completionTokens = 0;
    let ttsCharacters = 0;

    for (const action of actions) {
      const line = await generateLine(action, {
        level,
        mode: coCandidateMode,
        topic: {
          titleNo: prompts.titleNo,
          monologuePromptNo: prompts.monologuePromptNo,
          discussionPromptNo: prompts.discussionPromptNo,
          followUpQuestionsNo: selectedFollowUpQuestionsNo,
        },
        transcript,
      });

      promptTokens += line.promptTokens;
      completionTokens += line.completionTokens;
      ttsCharacters += line.text.length;

      transcript.push({
        speaker: action.persona,
        role: action.persona === 'examiner' ? 'EXAMINER' : 'AI_COCANDIDATE',
        text: line.text,
        timestamp: Date.now(),
        stage: toUiStage(engine.stage),
      });
    }

    const sessionEngineState: SessionEngineState = {
      engine,
      selectedFollowUpQuestionsNo,
      selectedPrompts: prompts,
      usage: {
        llmPromptTokens: promptTokens,
        llmCompletionTokens: completionTokens,
        ttsCharacters,
        sttAudioSeconds: 0,
      },
    };

    // 5. Insert new row into examSessions with status: 'ACTIVE', transcript, and engineState
    const [session] = await db
      .insert(examSessions)
      .values({
        userId,
        topicId: monologueTopicId,
        themeId: chosenTheme?.id ?? null,
        level,
        coCandidateMode,
        status: 'ACTIVE',
        transcriptJson: transcript,
        engineState: sessionEngineState,
      })
      .returning();

    const replies = transcript.map((entry, index) => ({
      index,
      speaker: entry.speaker as 'examiner' | 'co_candidate',
      role: entry.role,
      text: entry.text,
      audioUrl: `/api/exam/${session.id}/speech/${index}`,
    }));

    return NextResponse.json(
      {
        sessionId: session.id,
        stage: toUiStage(engine.stage),
        done: false,
        transcript,
        replies,
        topic: {
          id: monologueTopicId,
          titleNo: prompts.titleNo,
          monologuePromptNo: prompts.monologuePromptNo,
          discussionPromptNo: prompts.discussionPromptNo,
          followUpQuestionsNo: selectedFollowUpQuestionsNo,
        },
        theme: chosenTheme ? { id: chosenTheme.id, titleNo: chosenTheme.titleNo } : null,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: 'Unauthorized', message: error.message },
        { status: 401 }
      );
    }
    console.error('[Start Exam] Internal error:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
