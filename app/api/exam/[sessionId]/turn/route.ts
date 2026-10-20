import { NextRequest, NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import {
  examSessions,
  examTopics,
  userQuotas,
  TranscriptEntry,
  SessionEngineState,
} from '@/src/db/schema';
import {
  advance,
  countWords,
  initialState,
  toUiStage,
} from '@/src/server/exam-engine';
import { generateLine } from '@/src/server/personas';
import { transcribe } from '@/src/server/speech';
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

    const { session, topic } = row;

    // Verify session ownership
    if (session.userId !== user.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (session.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Session is no longer active', status: session.status },
        { status: 409 }
      );
    }

    // Parse multipart/form-data or JSON body
    const contentType = req.headers.get('content-type') || '';
    let audioBlob: Blob | null = null;
    let audioMime: string | undefined;
    let audioFileName: string | undefined;
    let durationMs = 0;
    let speakerRole: 'CANDIDATE_1' | 'CANDIDATE_2' = 'CANDIDATE_1';
    let endDiscussion = false;
    let textOverride: string | undefined;

    if (contentType.includes('multipart/form-data')) {
      const form = (await req.formData()) as unknown as {
        get(name: string): FormDataEntryValue | null;
      };
      const audioField = form.get('audio');
      if (audioField && typeof audioField === 'object' && 'arrayBuffer' in audioField) {
        audioBlob = audioField as Blob;
        audioMime = audioBlob.type || undefined;
        audioFileName = 'name' in audioField ? (audioField as File).name : undefined;
      }
      const rawDuration = form.get('durationMs');
      if (rawDuration !== null) {
        durationMs = Math.max(0, Number(rawDuration) || 0);
      }
      const rawSpeaker = form.get('speaker');
      if (rawSpeaker === 'CANDIDATE_2') {
        speakerRole = 'CANDIDATE_2';
      }
      const rawEnd = form.get('endDiscussion');
      if (rawEnd === 'true' || rawEnd === '1') {
        endDiscussion = true;
      }
      const rawText = form.get('textOverride');
      if (typeof rawText === 'string' && rawText.trim()) {
        textOverride = rawText.trim();
      }
    } else {
      const body = await req.json().catch(() => ({}));
      if (typeof body.durationMs === 'number') {
        durationMs = Math.max(0, body.durationMs);
      }
      if (body.speaker === 'CANDIDATE_2') {
        speakerRole = 'CANDIDATE_2';
      }
      if (body.endDiscussion === true) {
        endDiscussion = true;
      }
      if (typeof body.textOverride === 'string' && body.textOverride.trim()) {
        textOverride = body.textOverride.trim();
      }
    }

    if (!audioBlob && !endDiscussion && !textOverride) {
      return NextResponse.json(
        { error: 'Either an audio file or endDiscussion=true is required' },
        { status: 400 }
      );
    }

    // 1. Transcribe audio if provided
    let candidateText = textOverride ?? '';
    let sttSecondsThisTurn = 0;

    if (audioBlob && !textOverride) {
      candidateText = await transcribe(audioBlob, audioMime, audioFileName);
      sttSecondsThisTurn =
        durationMs > 0
          ? durationMs / 1000
          : Math.max(1, Math.round(audioBlob.size / 16000));
    } else if (durationMs > 0) {
      sttSecondsThisTurn = durationMs / 1000;
    }

    const transcript: TranscriptEntry[] = Array.isArray(session.transcriptJson)
      ? [...session.transcriptJson]
      : [];

    const existingState: SessionEngineState = session.engineState ?? {
      engine: initialState(),
      usage: {
        llmPromptTokens: 0,
        llmCompletionTokens: 0,
        ttsCharacters: 0,
        sttAudioSeconds: 0,
      },
    };

    const currentEngine = existingState.engine;

    // 2. If speech was silent/empty and not an explicit endDiscussion trigger, ask user to retry
    if (!endDiscussion && !candidateText.trim()) {
      return NextResponse.json({
        sessionId: session.id,
        retry: true,
        stage: toUiStage(currentEngine.stage),
        done: currentEngine.stage === 'DONE',
        candidateText: '',
        transcript,
        replies: [],
        message:
          'Beklager, jeg hørte ikke hva du sa. Prøv å snakke litt høyere og tydeligere.',
      });
    }

    // 3. Append candidate turn if text was spoken
    if (candidateText.trim()) {
      transcript.push({
        speaker: speakerRole === 'CANDIDATE_2' ? 'CANDIDATE_2' : 'CANDIDATE_1',
        role: speakerRole,
        text: candidateText.trim(),
        timestamp: Date.now(),
        stage: toUiStage(currentEngine.stage),
        durationMs: durationMs > 0 ? durationMs : undefined,
      });
    }

    const sessionSelectedFollowUps =
      Array.isArray(existingState.selectedFollowUpQuestionsNo) &&
      existingState.selectedFollowUpQuestionsNo.length > 0
        ? existingState.selectedFollowUpQuestionsNo
        : null;

    // Prefer the prompts composed at session start (may span several sets/themes)
    const selectedPrompts = existingState.selectedPrompts;
    const topicData = {
      titleNo: selectedPrompts?.titleNo || topic?.titleNo || 'Muntlig eksamenstema',
      monologuePromptNo:
        selectedPrompts?.monologuePromptNo ||
        topic?.monologuePromptNo ||
        'Gjør rede for dine tanker og erfaringer om temaet. Begrunn synspunktene dine.',
      discussionPromptNo:
        selectedPrompts?.discussionPromptNo ||
        topic?.discussionPromptNo ||
        'Diskuter temaet sammen. Drøft fordeler, ulemper og mulige løsninger.',
      followUpQuestionsNo:
        sessionSelectedFollowUps ??
        (Array.isArray(topic?.followUpQuestionsNo) && topic.followUpQuestionsNo.length > 0
          ? topic.followUpQuestionsNo
          : [
              'Hvilke konsekvenser tror du dette vil få for samfunnet på sikt?',
              'Hvordan stiller du deg til motargumentene som finnes?',
            ]),
    };

    // 4. Advance deterministic exam state machine
    const { state: nextEngine, speakers } = advance(
      currentEngine,
      {
        mode: session.coCandidateMode,
        wordCount: countWords(candidateText),
        endDiscussion,
        now: Date.now(),
      },
      topicData.followUpQuestionsNo.length
    );

    // 5. Generate examiner / co-candidate replies for the new state
    let turnPromptTokens = 0;
    let turnCompletionTokens = 0;
    let turnTtsChars = 0;
    const replies: Array<{
      index: number;
      speaker: 'examiner' | 'co_candidate';
      role: 'EXAMINER' | 'AI_COCANDIDATE';
      text: string;
      audioUrl: string;
    }> = [];

    for (const action of speakers) {
      const line = await generateLine(action, {
        level: session.level,
        mode: session.coCandidateMode,
        topic: topicData,
        transcript,
      });

      turnPromptTokens += line.promptTokens;
      turnCompletionTokens += line.completionTokens;
      turnTtsChars += line.text.length;

      const role = action.persona === 'examiner' ? 'EXAMINER' : 'AI_COCANDIDATE';
      const index = transcript.length;
      transcript.push({
        speaker: action.persona,
        role,
        text: line.text,
        timestamp: Date.now(),
        stage: toUiStage(nextEngine.stage),
      });

      replies.push({
        index,
        speaker: action.persona,
        role,
        text: line.text,
        audioUrl: `/api/exam/${session.id}/speech/${index}`,
      });
    }

    const updatedEngineState: SessionEngineState = {
      engine: nextEngine,
      selectedFollowUpQuestionsNo: existingState.selectedFollowUpQuestionsNo,
      usage: {
        llmPromptTokens: existingState.usage.llmPromptTokens + turnPromptTokens,
        llmCompletionTokens: existingState.usage.llmCompletionTokens + turnCompletionTokens,
        ttsCharacters: existingState.usage.ttsCharacters + turnTtsChars,
        sttAudioSeconds:
          Number((existingState.usage.sttAudioSeconds + sttSecondsThisTurn).toFixed(2)),
      },
    };

    const secondsToDeduct = Math.ceil(sttSecondsThisTurn);

    // 6. Save updated session state and deduct audio seconds from quota
    await db
      .update(examSessions)
      .set({
        transcriptJson: transcript,
        engineState: updatedEngineState,
      })
      .where(eq(examSessions.id, session.id));

    if (secondsToDeduct > 0) {
      await db
        .update(userQuotas)
        .set({
          remainingAudioSeconds: sql`GREATEST(0, ${userQuotas.remainingAudioSeconds} - ${secondsToDeduct})`,
          updatedAt: new Date(),
        })
        .where(eq(userQuotas.userId, session.userId));
    }

    return NextResponse.json({
      sessionId: session.id,
      retry: false,
      stage: toUiStage(nextEngine.stage),
      done: nextEngine.stage === 'DONE',
      candidateText: candidateText.trim(),
      transcript,
      replies,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: 'Unauthorized', message: error.message },
        { status: 401 }
      );
    }
    console.error('[POST /api/exam/[sessionId]/turn] Error:', error);
    return NextResponse.json(
      {
        error: 'Kunne ikke behandle lydopptaket',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
