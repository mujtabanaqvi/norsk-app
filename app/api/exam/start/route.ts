import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, or } from 'drizzle-orm';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { db } from '@/src/db';
import { examSessions, userQuotas, examTopics } from '@/src/db/schema';
import { authenticateUser } from '@/lib/auth';

// Validates the request body using Zod
export const startExamSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  topicId: z.string().min(1, 'topicId is required'),
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

    // 3. Fetch selected examTopics row by topicId (UUID or slug)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(topicId);
    const topicQuery = isUuid
      ? or(eq(examTopics.id, topicId), eq(examTopics.slug, topicId))
      : eq(examTopics.slug, topicId);

    const [topic] = await db
      .select()
      .from(examTopics)
      .where(topicQuery)
      .limit(1);

    if (!topic) {
      return NextResponse.json(
        { error: 'Topic not found.' },
        { status: 404 }
      );
    }

    // 4. Insert new row into examSessions with status: 'ACTIVE'
    const [session] = await db
      .insert(examSessions)
      .values({
        userId,
        topicId: topic.id,
        level,
        coCandidateMode,
        status: 'ACTIVE',
      })
      .returning();

    // 5. LiveKit RoomServiceClient & AccessToken setup
    const livekitUrl = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!livekitUrl || !apiKey || !apiSecret) {
      console.error('[Start Exam] Missing LiveKit environment variables');
      return NextResponse.json(
        { error: 'Server misconfiguration: LiveKit credentials missing' },
        { status: 500 }
      );
    }

    const roomName = `exam_${session.id}`;
    const roomMetadata = JSON.stringify({
      sessionId: session.id,
      userId,
      level,
      coCandidateMode,
      topic: {
        titleNo: topic.titleNo,
        monologuePromptNo: topic.monologuePromptNo,
        discussionPromptNo: topic.discussionPromptNo,
        followUpQuestionsNo: topic.followUpQuestionsNo,
      },
    });

    // Create LiveKit room
    const livekitHttpHost = livekitUrl.replace(/^ws(s)?:\/\//i, 'https://');
    const roomServiceClient = new RoomServiceClient(livekitHttpHost, apiKey, apiSecret);

    await roomServiceClient.createRoom({
      name: roomName,
      emptyTimeout: 300,
      metadata: roomMetadata,
    });

    // Generate participant AccessToken
    const token = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      ttl: '2h',
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwtToken = await token.toJwt();

    return NextResponse.json(
      {
        sessionId: session.id,
        roomName,
        token: jwtToken,
        livekitUrl: process.env.LIVEKIT_URL,
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
