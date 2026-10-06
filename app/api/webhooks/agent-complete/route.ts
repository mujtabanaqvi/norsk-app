import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { examSessions, usageLedger, userQuotas } from '@/db/schema';
import { calculateEstimatedCostUsd } from '@/lib/cost-calculator';
import { triggerB1B2Evaluation } from '@/lib/evaluation';

// Strict Zod schema for LiveKit Agent Worker completion payload
const agentCompletePayloadSchema = z.object({
  sessionId: z.string().uuid({ message: 'sessionId must be a valid UUID' }),
  userId: z.string().min(1, { message: 'userId is required' }),
  usage: z.object({
    llmPromptTokens: z.number().int().min(0, 'llmPromptTokens cannot be negative'),
    llmCompletionTokens: z.number().int().min(0, 'llmCompletionTokens cannot be negative'),
    ttsCharacters: z.number().int().min(0, 'ttsCharacters cannot be negative'),
    sttAudioSeconds: z.number().min(0, 'sttAudioSeconds cannot be negative'),
  }),
  transcript: z.array(
    z.object({
      speaker: z.string().min(1, 'speaker is required'),
      role: z.string().min(1, 'role is required'),
      text: z.string(),
      timestamp: z.number(),
    })
  ),
});

/**
 * Timing-safe string comparison to mitigate timing side-channel attacks
 */
function safeCompareTokens(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(req: NextRequest) {
  try {
    // 1. Verify Authorization header against AGENT_WEBHOOK_SECRET
    const authHeader = req.headers.get('authorization');
    const secret = process.env.AGENT_WEBHOOK_SECRET;

    if (!secret) {
      console.error('[Agent Complete Webhook] AGENT_WEBHOOK_SECRET is not configured in environment');
      return NextResponse.json(
        { error: 'Server misconfiguration: Webhook secret not set' },
        { status: 500 }
      );
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized: Missing or malformed Bearer token' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7).trim();
    if (!safeCompareTokens(token, secret)) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid webhook secret' },
        { status: 401 }
      );
    }

    // 2. Parse and validate JSON payload
    let rawPayload: unknown;
    try {
      rawPayload = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    const validation = agentCompletePayloadSchema.safeParse(rawPayload);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Invalid payload structure',
          issues: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { sessionId, userId, usage, transcript } = validation.data;

    // 3. Locate target exam session
    const [session] = await db
      .select()
      .from(examSessions)
      .where(eq(examSessions.id, sessionId))
      .limit(1);

    if (!session) {
      return NextResponse.json(
        { error: `Exam session not found: ${sessionId}` },
        { status: 404 }
      );
    }

    // 4. Calculate estimated costs (OpenAI GPT-4.1-mini + ElevenLabs Flash v2.5 + Deepgram Nova-3)
    const costBreakdown = calculateEstimatedCostUsd(usage);
    const estimatedCostUsd = costBreakdown.totalEstimatedCostUsdFormatted;
    const totalTokensUsed = usage.llmPromptTokens + usage.llmCompletionTokens;
    const secondsToDeduct = Math.ceil(usage.sttAudioSeconds);

    const ledgerId = crypto.randomUUID();

    // 5. Execute atomic database transaction
    await db.transaction(async (tx) => {
      // a) Insert a record into usage_ledger
      await tx.insert(usageLedger).values({
        id: ledgerId,
        sessionId,
        userId,
        llmPromptTokens: usage.llmPromptTokens,
        llmCompletionTokens: usage.llmCompletionTokens,
        ttsCharacters: usage.ttsCharacters,
        sttAudioSeconds: usage.sttAudioSeconds.toFixed(2),
        estimatedCostUsd,
        createdAt: new Date(),
      });

      // b) Deduct sttAudioSeconds from user_quotas.remainingSeconds,
      //    and increment totalTokensUsed and totalCostUsd
      await tx
        .insert(userQuotas)
        .values({
          userId,
          remainingSeconds: 0,
          totalTokensUsed,
          totalCostUsd: estimatedCostUsd,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userQuotas.userId,
          set: {
            remainingSeconds: sql`GREATEST(0, ${userQuotas.remainingSeconds} - ${secondsToDeduct})`,
            totalTokensUsed: sql`${userQuotas.totalTokensUsed} + ${totalTokensUsed}`,
            totalCostUsd: sql`(${userQuotas.totalCostUsd} + ${estimatedCostUsd}::numeric)`,
            updatedAt: new Date(),
          },
        });

      // c) Save transcriptJson into exam_sessions and mark status COMPLETED
      await tx
        .update(examSessions)
        .set({
          status: 'COMPLETED',
          transcriptJson: transcript,
          updatedAt: new Date(),
        })
        .where(eq(examSessions.id, sessionId));
    });

    // d) Trigger the asynchronous B1/B2 rubric evaluation function
    triggerB1B2Evaluation({
      sessionId,
      level: session.level,
      topic: session.topic,
      transcript,
    });

    // 6. Return response to LiveKit Agent Worker
    return NextResponse.json(
      {
        success: true,
        sessionId,
        ledgerId,
        costBreakdown: {
          llmCostUsd: costBreakdown.totalLlmCostUsd,
          ttsCostUsd: costBreakdown.ttsCostUsd,
          sttCostUsd: costBreakdown.sttCostUsd,
          totalEstimatedCostUsd: Number(estimatedCostUsd),
        },
        deductedSeconds: secondsToDeduct,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Agent Complete Webhook] Error processing webhook:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

