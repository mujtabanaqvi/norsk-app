import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { examSessions, examTopics, usageLedger } from '@/src/db/schema';
import { authenticateUser } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    // Validate UUID format
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId);
    if (!isUuid) {
      return NextResponse.json({ error: 'Invalid sessionId format' }, { status: 400 });
    }

    // Fetch the examSessions row matching sessionId along with associated examTopics details
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

    // Optional user authorization verification if credentials are present
    try {
      const user = await authenticateUser(req);
      if (user && session.userId !== user.userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch {
      // Allow unauthenticated query if the client possesses the unguessable session UUID
    }

    // Fetch usageLedger entries for this session
    const usageEntries = await db
      .select()
      .from(usageLedger)
      .where(eq(usageLedger.sessionId, sessionId))
      .orderBy(usageLedger.createdAt);

    return NextResponse.json({
      status: session.status,
      level: session.level,
      coCandidateMode: session.coCandidateMode,
      transcriptJson: session.transcriptJson ?? [],
      evaluationJson: session.evaluationJson ?? null,
      usage: usageEntries,
      topic: row.topic ?? null,
    });
  } catch (error) {
    console.error('[GET /api/exam/[sessionId]/results] Internal Error:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

