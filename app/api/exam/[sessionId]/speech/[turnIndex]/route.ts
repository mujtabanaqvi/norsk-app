import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { examSessions, TranscriptEntry } from '@/src/db/schema';
import { synthesizeStream } from '@/src/server/speech';
import type { Persona } from '@/src/server/exam-engine';
import { authenticateUser, AuthenticationError } from '@/lib/auth';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string; turnIndex: string }> }
) {
  try {
    const user = await authenticateUser(req);
    const { sessionId, turnIndex } = await params;

    if (!sessionId || !UUID_REGEX.test(sessionId)) {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
    }

    const index = Number.parseInt(turnIndex, 10);
    if (!Number.isInteger(index) || index < 0) {
      return NextResponse.json({ error: 'Invalid turnIndex' }, { status: 400 });
    }

    const [session] = await db
      .select()
      .from(examSessions)
      .where(eq(examSessions.id, sessionId))
      .limit(1);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.userId !== user.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const transcript = (session.transcriptJson as TranscriptEntry[]) || [];
    const entry = transcript[index];
    if (!entry || !entry.text) {
      return NextResponse.json({ error: 'Transcript turn not found' }, { status: 404 });
    }

    const persona: Persona =
      entry.role === 'AI_COCANDIDATE' || entry.speaker === 'co_candidate'
        ? 'co_candidate'
        : 'examiner';

    const audioStream = await synthesizeStream(entry.text, persona);

    return new NextResponse(audioStream, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[GET /api/exam/[sessionId]/speech/[turnIndex]] Error:', error);
    return NextResponse.json(
      {
        error: 'Kunne ikke generere tale',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

