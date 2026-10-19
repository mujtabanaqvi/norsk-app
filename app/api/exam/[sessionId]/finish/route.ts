import { NextRequest, NextResponse, after } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { examSessions, usageLedger, userQuotas } from '@/src/db/schema';
import { calculateEstimatedCostUsd } from '@/lib/cost-calculator';
import { evaluateExamSession } from '@/src/lib/evaluate-exam';
import { CONVERSATION_MODEL } from '@/src/server/personas';
import { authenticateUser, AuthenticationError } from '@/lib/auth';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await authenticateUser(req);
    const { sessionId } = await params;

    if (!sessionId || !UUID_REGEX.test(sessionId)) {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
    }

    const [session] = await db
      .select()
      .from(examSessions)
      .where(eq(examSessions.id, sessionId))
      .limit(1);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Ensure session belongs to the authenticated user
    if (session.userId !== user.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Idempotent handling if already completed
    if (session.status === 'COMPLETED') {
      if (!session.evaluationJson) {
        after(async () => {
          try {
            await evaluateExamSession(session.id);
          } catch (err) {
            console.error(`[Finish Exam] Background evaluation error for ${session.id}:`, err);
          }
        });
      }
      return NextResponse.json({
        sessionId: session.id,
        status: 'COMPLETED',
      });
    }

    const usage = session.engineState?.usage ?? {
      llmPromptTokens: 0,
      llmCompletionTokens: 0,
      ttsCharacters: 0,
      sttAudioSeconds: 0,
    };

    const costBreakdown = calculateEstimatedCostUsd({
      llmPromptTokens: usage.llmPromptTokens,
      llmCompletionTokens: usage.llmCompletionTokens,
      ttsCharacters: usage.ttsCharacters,
      sttAudioSeconds: usage.sttAudioSeconds,
    });

    const estimatedCostUsd = costBreakdown.totalEstimatedCostUsdFormatted;
    const totalTokensUsed = usage.llmPromptTokens + usage.llmCompletionTokens;
    const sttSecondsFormatted = usage.sttAudioSeconds.toFixed(2);

    await db.transaction(async (tx) => {
      await tx
        .update(examSessions)
        .set({
          status: 'COMPLETED',
          completedAt: new Date(),
        })
        .where(eq(examSessions.id, session.id));

      await tx.insert(usageLedger).values({
        sessionId: session.id,
        userId: session.userId,
        source: 'REALTIME_VOICE_AGENT',
        llmModel: CONVERSATION_MODEL,
        llmPromptTokens: usage.llmPromptTokens,
        llmCompletionTokens: usage.llmCompletionTokens,
        ttsCharacters: usage.ttsCharacters,
        sttAudioSeconds: sttSecondsFormatted,
        estimatedCostUsd,
      });

      await tx
        .insert(userQuotas)
        .values({
          userId: session.userId,
          remainingAudioSeconds: 1800,
          totalLlmTokensUsed: totalTokensUsed,
          totalTtsCharactersUsed: usage.ttsCharacters,
          totalSttSecondsUsed: sttSecondsFormatted,
          totalCostUsd: estimatedCostUsd,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userQuotas.userId,
          set: {
            totalLlmTokensUsed: sql`${userQuotas.totalLlmTokensUsed} + ${totalTokensUsed}`,
            totalTtsCharactersUsed: sql`${userQuotas.totalTtsCharactersUsed} + ${usage.ttsCharacters}`,
            totalSttSecondsUsed: sql`(${userQuotas.totalSttSecondsUsed} + ${sttSecondsFormatted}::numeric)`,
            totalCostUsd: sql`(${userQuotas.totalCostUsd} + ${estimatedCostUsd}::numeric)`,
            updatedAt: new Date(),
          },
        });
    });

    // Trigger post-exam rubric evaluation asynchronously after HTTP response completes
    after(async () => {
      try {
        await evaluateExamSession(session.id);
      } catch (err) {
        console.error(`[Finish Exam] Background evaluation error for ${session.id}:`, err);
      }
    });

    return NextResponse.json({
      sessionId: session.id,
      status: 'COMPLETED',
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: 'Unauthorized', message: error.message },
        { status: 401 }
      );
    }
    console.error('[POST /api/exam/[sessionId]/finish] Error:', error);
    return NextResponse.json(
      {
        error: 'Kunne ikke avslutte eksamensesjonen',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

