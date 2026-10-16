import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, or } from 'drizzle-orm';
import { db } from '@/src/db';
import {
  examSessions,
  userQuotas,
  examTopics,
  ExamTopic,
  TranscriptEntry,
  SessionEngineState,
} from '@/src/db/schema';
import { authenticateUser } from '@/lib/auth';
import { initialState, openingActions, toUiStage } from '@/src/server/exam-engine';
import {
  pickRandomExamTopic,
  pickRandomFollowUpQuestions,
} from '@/src/server/exam-randomizer';
import { generateLine } from '@/src/server/personas';

// Validates the request body using Zod (topicId is optional; omit or pass 'RANDOM' for random selection)
export const startExamSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  topicId: z.string().optional(),
  level: z.enum(['B1', 'B2']),
  coCandidateMode: z.enum(['AI_PEER', 'HUMAN_LOCAL']),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Parse JSON payload
    let rawJson: Record<string, unknown>;
    try {
      rawJson = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    // Optional header authentication fallback for userId if omitted in JSON body
    if (!rawJson.userId) {
      try {
        const authUser = await authenticateUser(req);
        if (authUser?.userId) {
          rawJson.userId = authUser.userId;
        }
      } catch {
        // Fall through to Zod validation
      }
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

    const { userId, topicId, level, coCandidateMode } = validationResult.data;

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

    // 3. Resolve exam topic: randomly pick an active topic for the level, or look up specific topicId
    let topic: ExamTopic | undefined | null;
    const trimmedTopicId = topicId?.trim();
    const shouldPickRandom =
      !trimmedTopicId || trimmedTopicId.toUpperCase() === 'RANDOM';

    if (shouldPickRandom) {
      const activeTopicsForLevel = await db
        .select()
        .from(examTopics)
        .where(and(eq(examTopics.level, level), eq(examTopics.isActive, true)));

      topic = pickRandomExamTopic(activeTopicsForLevel);

      // Fallback if no active topics found for exact level: check any active topic
      if (!topic) {
        const anyActiveTopics = await db
          .select()
          .from(examTopics)
          .where(eq(examTopics.isActive, true));
        topic = pickRandomExamTopic(anyActiveTopics);
      }
    } else {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          trimmedTopicId
        );
      const topicQuery = isUuid
        ? or(eq(examTopics.id, trimmedTopicId), eq(examTopics.slug, trimmedTopicId))
        : eq(examTopics.slug, trimmedTopicId);

      const [foundTopic] = await db
        .select()
        .from(examTopics)
        .where(topicQuery)
        .limit(1);

      topic = foundTopic;
    }

    if (!topic) {
      return NextResponse.json(
        { error: 'Topic not found.' },
        { status: 404 }
      );
    }

    // Randomly draw up to 3 Del 3 follow-up questions from the exam's question pool
    const selectedFollowUpQuestionsNo = pickRandomFollowUpQuestions(
      topic.followUpQuestionsNo,
      3
    );

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
          titleNo: topic.titleNo,
          monologuePromptNo: topic.monologuePromptNo,
          discussionPromptNo: topic.discussionPromptNo,
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
        topicId: topic.id,
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
          id: topic.id,
          titleNo: topic.titleNo,
          monologuePromptNo: topic.monologuePromptNo,
          discussionPromptNo: topic.discussionPromptNo,
          followUpQuestionsNo: selectedFollowUpQuestionsNo,
        },
      },
      { status: 201 }
    );
  } catch (error) {
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
