import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { db } from '@/db';
import { examSessions, userQuotas } from '@/db/schema';
import { authenticateUser, AuthenticationError } from '@/lib/auth';
import { getTopicById } from '@/lib/topics';

// Strict input validation schema
const startExamSchema = z.object({
  level: z.enum(['B1', 'B2'], {
    required_error: 'Exam level is required',
    invalid_type_error: "Level must be either 'B1' or 'B2'",
  }),
  coCandidateMode: z.enum(['AI_PEER', 'HUMAN_LOCAL'], {
    required_error: 'Co-candidate mode is required',
    invalid_type_error: "Mode must be 'AI_PEER' or 'HUMAN_LOCAL'",
  }),
  topicId: z.string().min(1, 'topicId cannot be empty'),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const user = await authenticateUser(req);

    // 2. Parse and strictly validate request payload
    let rawJson: unknown;
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

    const { level, coCandidateMode, topicId } = validationResult.data;

    // 3. Check quota: user_quotas.remainingSeconds must be > 180 seconds
    const [quota] = await db
      .select()
      .from(userQuotas)
      .where(eq(userQuotas.userId, user.userId))
      .limit(1);

    const remainingSeconds = quota?.remainingSeconds ?? 0;
    if (remainingSeconds <= 180) {
      return NextResponse.json(
        {
          error: 'Payment Required',
          message:
            'Insufficient remaining time quota. A minimum of 180 seconds is required to start a practice exam session.',
          code: 'INSUFFICIENT_QUOTA',
          remainingSeconds,
          minimumRequiredSeconds: 180,
        },
        { status: 402 }
      );
    }

    // 4. Resolve topic prompt details
    const topicInfo = getTopicById(topicId, level);
    const sessionId = crypto.randomUUID();
    const roomName = `exam_${sessionId}`;

    // 5. Insert new row in exam_sessions
    await db.insert(examSessions).values({
      id: sessionId,
      userId: user.userId,
      level,
      coCandidateMode,
      topic: topicInfo.title,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 6. LiveKit configuration
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

    // LiveKit HTTP endpoint for RoomServiceClient (convert wss:// -> https://)
    const livekitHttpHost = livekitUrl.replace(/^ws(s)?:\/\//i, 'https://');

    const roomServiceClient = new RoomServiceClient(
      livekitHttpHost,
      apiKey,
      apiSecret
    );

    // Embed room metadata as a JSON string for the LiveKit Agent Worker
    const roomMetadata = {
      sessionId,
      userId: user.userId,
      level,
      coCandidateMode,
      topicPrompt: topicInfo.topicPrompt,
    };

    // Create room with metadata
    await roomServiceClient.createRoom({
      name: roomName,
      emptyTimeout: 300, // 5 minutes empty timeout
      maxParticipants: 5,
      metadata: JSON.stringify(roomMetadata),
    });

    // 7. Mint client AccessToken for the participant
    const token = new AccessToken(apiKey, apiSecret, {
      identity: user.userId,
      name: `Kandidat-${user.userId.slice(0, 8)}`,
      ttl: '2h',
      metadata: JSON.stringify({
        sessionId,
        role: 'candidate',
        level,
      }),
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwtToken = await token.toJwt();

    // 8. Return response to React Native client
    return NextResponse.json(
      {
        token: jwtToken,
        roomName,
        sessionId,
        livekitUrl,
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

