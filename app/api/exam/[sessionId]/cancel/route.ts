import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { examSessions, userQuotas } from '@/src/db/schema';
import { calculateEstimatedCostUsd } from '@/lib/cost-calculator';
import { authenticateUser, AuthenticationError } from '@/lib/auth';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cancel an exam without evaluation. Only allowed during Del 1 (before the discussion starts).
 * The session is deleted, so it never uses a daily test slot; its AI usage is still added to the
 * user's cost totals.
 */
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

    const usage = session.engineState?.usage ?? {
      llmPromptTokens: 0,
      llmCompletionTokens: 0,
      ttsCharacters: 0,
      sttAudioSeconds: 0,
    };

    const estimatedCostUsd = calculateEstimatedCostUsd({
      llmPromptTokens: usage.llmPromptTokens,
      llmCompletionTokens: usage.llmCompletionTokens,
      ttsCharacters: usage.ttsCharacters,
      sttAudioSeconds: usage.sttAudioSeconds,
    }).totalEstimatedCostUsdFormatted;
    const totalTokensUsed = usage.llmPromptTokens + usage.llmCompletionTokens;
    const sttSecondsFormatted = usage.sttAudioSeconds.toFixed(2);

    const deleted = await db.transaction(async (tx) => {
      // Re-checked in the delete itself, so a turn that just moved the exam into Del 2 wins
      const rows = await tx
        .delete(examSessions)
        .where(
          and(
            eq(examSessions.id, session.id),
            eq(examSessions.status, 'ACTIVE'),
            sql`${examSessions.engineState} -> 'engine' ->> 'stage' = 'DEL1_MONOLOGUE'`
          )
        )
        .returning({ id: examSessions.id });

      if (rows.length === 0) return false;

      await tx
        .update(userQuotas)
        .set({
          totalLlmTokensUsed: sql`${userQuotas.totalLlmTokensUsed} + ${totalTokensUsed}`,
          totalTtsCharactersUsed: sql`${userQuotas.totalTtsCharactersUsed} + ${usage.ttsCharacters}`,
          totalSttSecondsUsed: sql`(${userQuotas.totalSttSecondsUsed} + ${sttSecondsFormatted}::numeric)`,
          totalCostUsd: sql`(${userQuotas.totalCostUsd} + ${estimatedCostUsd}::numeric)`,
          updatedAt: new Date(),
        })
        .where(eq(userQuotas.userId, session.userId));

      return true;
    });

    if (!deleted) {
      return NextResponse.json(
        {
          error: 'CANCEL_NOT_ALLOWED',
          message: 'Prøven kan bare avbrytes før samtalen i del 2 starter.',
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ sessionId: session.id, status: 'CANCELLED' });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: 'Unauthorized', message: error.message },
        { status: 401 }
      );
    }
    console.error('[POST /api/exam/[sessionId]/cancel] Error:', error);
    return NextResponse.json(
      {
        error: 'Kunne ikke avbryte eksamensesjonen',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
