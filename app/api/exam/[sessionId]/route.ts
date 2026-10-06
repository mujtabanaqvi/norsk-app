import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { examSessions, examTopics } from '@/src/db/schema';
import { authenticateUser, AuthenticationError } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const user = await authenticateUser(req);
    const { sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const [row] = await db
      .select({
        session: examSessions,
        topic: examTopics,
      })
      .from(examSessions)
      .leftJoin(examTopics, eq(examSessions.topicId, examTopics.id))
      .where(eq(examSessions.id, sessionId))
      .limit(1);

    if (!row || !row.session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const session = row.session;

    // Ensure users can only inspect their own exam sessions unless admin
    if (session.userId !== user.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      id: session.id,
      userId: session.userId,
      level: session.level,
      coCandidateMode: session.coCandidateMode,
      topicId: session.topicId,
      topicTitle: row.topic?.titleNo || null,
      topic: row.topic ?? null,
      status: session.status,
      transcript: session.transcriptJson ?? [],
      evaluation: session.evaluationJson ?? null,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    console.error('[Get Exam Session] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
