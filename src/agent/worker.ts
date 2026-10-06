import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { fileURLToPath } from 'node:url';
import {
  WorkerOptions,
  cli,
  defineAgent,
  JobContext,
  JobProcess,
  voice,
  llm,
  metrics,
  initializeLogger,
  loggerOptions,
} from '@livekit/agents';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import * as openai from '@livekit/agents-plugin-openai';
import * as silero from '@livekit/agents-plugin-silero';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index';
import { examSessions, userQuotas, usageLedger, TranscriptEntry } from '../db/schema';
import { evaluateExamSession } from '../lib/evaluate-exam';
import { calculateEstimatedCostUsd } from '../../lib/cost-calculator';

// Ensure logger is initialized when imported outside the CLI runner
if (!loggerOptions()) {
  initializeLogger({ pretty: false, level: 'info' });
}

// --- Type Definitions ---

export interface TopicMetadata {
  titleNo: string;
  monologuePromptNo: string;
  discussionPromptNo: string;
  followUpQuestionsNo: string[];
}

export interface SessionMetadata {
  sessionId: string;
  userId: string;
  level: 'B1' | 'B2';
  coCandidateMode: 'AI_PEER' | 'HUMAN_LOCAL';
  topic: TopicMetadata;
}

export interface SessionCoordinator {
  metadata: SessionMetadata;
  setActiveSpeaker: (speaker: 'examiner' | 'co_candidate') => void;
  activatePassiveModerator: () => void;
  session?: voice.AgentSession;
}

// --- Metadata Parser ---

export function parseRoomMetadata(rawMetadata?: string): SessionMetadata {
  if (!rawMetadata) {
    throw new Error('Room metadata is required but was not provided.');
  }

  const parsed = JSON.parse(rawMetadata);
  const rawTopic = parsed.topic ?? {};

  const titleNo =
    rawTopic.titleNo || rawTopic.title || parsed.topicPrompt || 'Muntlig eksamenstema';
  const monologuePromptNo =
    rawTopic.monologuePromptNo ||
    'Gjør rede for dine tanker og erfaringer om temaet. Begrunn synspunktene dine.';
  const discussionPromptNo =
    rawTopic.discussionPromptNo ||
    rawTopic.title ||
    parsed.topicPrompt ||
    'Diskuter temaet sammen. Drøft fordeler, ulemper og mulige løsninger.';
  const followUpQuestionsNo: string[] =
    Array.isArray(rawTopic.followUpQuestionsNo) && rawTopic.followUpQuestionsNo.length > 0
      ? rawTopic.followUpQuestionsNo
      : [
          'Hvilke konsekvenser tror du dette vil få for samfunnet på sikt?',
          'Hvordan stiller du deg til motargumentene som finnes?',
        ];

  return {
    sessionId: parsed.sessionId || crypto.randomUUID(),
    userId: parsed.userId || 'anonymous-candidate',
    level: parsed.level === 'B2' ? 'B2' : 'B1',
    coCandidateMode: parsed.coCandidateMode === 'HUMAN_LOCAL' ? 'HUMAN_LOCAL' : 'AI_PEER',
    topic: {
      titleNo,
      monologuePromptNo,
      discussionPromptNo,
      followUpQuestionsNo,
    },
  };
}

// --- ExaminerAgent ---

export class ExaminerAgent extends voice.Agent {
  constructor(
    metadata: SessionMetadata,
    coordinator: SessionCoordinator,
    existingChatCtx?: llm.ChatContext,
    stage: 'DEL_1' | 'DEL_2' | 'DEL_3' = 'DEL_1'
  ) {
    const instructions = `
Du er en offisiell sensor for Norskprøven muntlig på nivå ${metadata.level} (HK-dir).
Du skal kommunisere på vennlig, profesjonelt og tydelig norsk (Bokmål).

Eksamenens struktur:
- Del 1 (Individuell monolog): Kandidaten snakker alene om temaet: "${metadata.topic.titleNo}".
  Oppgave: "${metadata.topic.monologuePromptNo}".
- Del 2 (Samtaleoppgave): Diskusjon om: "${metadata.topic.discussionPromptNo}".
- Del 3 (Oppfølgingsspørsmål): Sensor stiller fordypende spørsmål:
  ${metadata.topic.followUpQuestionsNo.map((q, i) => `  ${i + 1}. ${q}`).join('\n')}

Gjeldende fase: ${stage}.
- Hvis du er i Del 1: Når kandidaten er ferdig med monologen, introduser Del 2 kort og kall det aktuelle verktøyet:
  * Hvis modus er AI_PEER: Kall verktøyet "startAiPeerDiscussion" slik at AI-medkandidaten overtar ordet.
  * Hvis modus er HUMAN_LOCAL: Kall verktøyet "startHumanLocalDiscussion" for å gi ordet til de to kandidatene i rommet.
- Hvis du er i Del 3: Still spørsmålene fra listen over ett og ett. Følg opp kandidatens svar. Når du har fått svar på spørsmålene, takk for prøven og avslutt formelt.
`;

    super({
      instructions,
      tts: new elevenlabs.TTS({
        model: 'eleven_flash_v2_5',
        voiceId: process.env.ELEVEN_EXAMINER_VOICE_ID,
      }),
      llm: new openai.LLM({
        model: 'gpt-4.1-mini',
        apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-initialization',
      }),
      tools: [
        llm.tool({
          name: 'startAiPeerDiscussion',
          description:
            'Start Del 2 (samtaleoppgave) med AI-medkandidaten når kandidaten har fullført sin monolog i Del 1.',
          execute: async () => {
            coordinator.setActiveSpeaker('co_candidate');
            const coCandidate = new CoCandidateAgent(
              metadata,
              coordinator,
              this.chatCtx ? this.chatCtx.copy() : undefined
            );
            return llm.handoff({
              agent: coCandidate,
              returns: 'AI-medkandidaten trer nå inn i samtalen for å diskutere temaet.',
            });
          },
        }),
        llm.tool({
          name: 'startHumanLocalDiscussion',
          description:
            'Aktiver passiv sensormodus for Del 2 når to kandidater er fysisk til stede i samme rom.',
          execute: async () => {
            coordinator.activatePassiveModerator();
            return 'Passiv sensormodus aktivert. De to kandidatene kan nå samtale fritt uten avbrudd i inntil 3 minutter.';
          },
        }),
      ],
      chatCtx: existingChatCtx,
    });
  }
}

// --- CoCandidateAgent ---

export class CoCandidateAgent extends voice.Agent {
  private turnCount = 0;

  constructor(
    metadata: SessionMetadata,
    coordinator: SessionCoordinator,
    existingChatCtx?: llm.ChatContext
  ) {
    const instructions = `
Du er en medkandidat som avlegger Norskprøven muntlig på nivå ${metadata.level} sammen med brukeren.
Du skal diskutere følgende samtaleoppgave på naturlig, muntlig norsk (Bokmål):
"${metadata.topic.discussionPromptNo}"

Regler for din rolle:
- Snakk i korte, naturlige turer (2-3 setninger per replikk).
- Uttrykk egne meninger, del enkle erfaringer og still oppfølgingsspørsmål til brukeren (f.eks. "Hva tenker du om det?", "Jeg er litt uenig fordi...", "Hva mener du?").
- Vis engasjement og aktiv lytting.
- Etter 5 til 6 replikkvekslinger skal du avrunde samtalen høflig og kalle verktøyet "returnToExaminer" for å sende ordet tilbake til sensor for Del 3.
`;

    super({
      instructions,
      tts: new elevenlabs.TTS({
        model: 'eleven_flash_v2_5',
        voiceId: process.env.ELEVEN_COCANDIDATE_VOICE_ID,
      }),
      llm: new openai.LLM({
        model: 'gpt-4.1-mini',
        apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-initialization',
      }),
      tools: [
        llm.tool({
          name: 'returnToExaminer',
          description:
            'Avslutt Del 2 (samtalen) etter 5-6 replikkvekslinger og send ordet tilbake til sensor for Del 3 (oppfølgingsspørsmål).',
          execute: async () => {
            coordinator.setActiveSpeaker('examiner');
            const examiner = new ExaminerAgent(
              metadata,
              coordinator,
              this.chatCtx ? this.chatCtx.copy() : undefined,
              'DEL_3'
            );
            return llm.handoff({
              agent: examiner,
              returns:
                'Samtaleoppgaven er fullført. Sensor overtar nå for å stille oppfølgingsspørsmål (Del 3).',
            });
          },
        }),
      ],
      chatCtx: existingChatCtx,
    });
  }

  override async onUserTurnCompleted(
    chatCtx: llm.ChatContext,
    newMessage: llm.ChatMessage
  ): Promise<void> {
    this.turnCount++;
    await super.onUserTurnCompleted(chatCtx, newMessage);
  }
}

// --- Define LiveKit Agent ---

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    // Preload Silero VAD with 0.9s silence duration so B1/B2 learners are not cut off while formulating thoughts
    proc.userData.vad = await silero.VAD.load({ minSilenceDuration: 0.9 });
  },

  entry: async (ctx: JobContext) => {
    // 1. Parse Room Metadata
    const metadata = parseRoomMetadata(ctx.room.metadata);

    // 2. Preload/Retrieve VAD
    const vad =
      (ctx.proc.userData.vad as silero.VAD) ||
      (await silero.VAD.load({ minSilenceDuration: 0.9 }));

    // 3. Configure Deepgram STT (nova-3, norsk, diarization if two humans sharing microphone)
    const stt = new deepgram.STT({
      model: 'nova-3',
      language: 'no',
      smartFormat: true,
      fillerWords: true,
      diarize: metadata.coCandidateMode === 'HUMAN_LOCAL',
    });

    // 4. Configure OpenAI LLM
    const defaultLlm = new openai.LLM({
      model: 'gpt-4.1-mini',
      apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-initialization',
    });

    // 5. State tracking
    let currentSpeaker: 'examiner' | 'co_candidate' = 'examiner';
    let isPassiveModerator = false;
    let passiveModeratorTimer: NodeJS.Timeout | null = null;
    let lastUserSpeakerId: string | null = null;

    const transcriptEntries: TranscriptEntry[] = [];

    // 6. Setup Coordinator
    const coordinator: SessionCoordinator = {
      metadata,
      setActiveSpeaker: (speaker: 'examiner' | 'co_candidate') => {
        currentSpeaker = speaker;
      },
      activatePassiveModerator: () => {
        if (isPassiveModerator) return;
        isPassiveModerator = true;
        console.log('[Worker] Passive Moderator Mode activated for HUMAN_LOCAL discussion.');

        // Disable automatic agent turn responses so Human 1 & Human 2 speak without interruption
        session.pauseReplyAuthorization();

        // 180-second discussion timer
        passiveModeratorTimer = setTimeout(() => {
          exitPassiveModerator('TIMEOUT_180S');
        }, 180_000);
      },
    };

    function exitPassiveModerator(reason: string) {
      if (!isPassiveModerator) return;
      isPassiveModerator = false;
      console.log(`[Worker] Exiting Passive Moderator Mode. Reason: ${reason}`);

      if (passiveModeratorTimer) {
        clearTimeout(passiveModeratorTimer);
        passiveModeratorTimer = null;
      }

      // Resume automatic replies for sensor
      try {
        session.resumeReplyAuthorization();
      } catch (err) {
        console.error('[Worker] Error resuming reply authorization:', err);
      }

      currentSpeaker = 'examiner';

      // Prompt ExaminerAgent to transition to Del 3 (Oppfølgingsspørsmål)
      session.generateReply({
        userInput:
          'Samtaledelen (Del 2) mellom kandidatene er nå over. Start Del 3 (oppfølgingsspørsmål) og still det første spørsmålet.',
      });
    }

    // 7. Instantiate ExaminerAgent as starting agent
    const initialExaminer = new ExaminerAgent(metadata, coordinator, undefined, 'DEL_1');

    // 8. Setup AgentSession
    const session = new voice.AgentSession({
      stt,
      vad,
      llm: defaultLlm,
    });
    coordinator.session = session;

    // 9. Metrics and Usage Tracking
    const usageCollector = new metrics.UsageCollector();
    session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
      usageCollector.collect(ev.metrics);
    });

    // 10. Listen for STT transcript events to capture diarized speaker identifiers
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
      if (ev.isFinal && ev.speakerId) {
        lastUserSpeakerId = ev.speakerId;
      }
    });

    // 11. Listen for Conversation Items to record structured transcript
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => {
      const item = ev.item;
      if (item.type !== 'message') return;

      const chatMsg = item as llm.ChatMessage;
      let text = '';
      if (typeof chatMsg.content === 'string') {
        text = chatMsg.content;
      } else if (Array.isArray(chatMsg.content)) {
        text = chatMsg.content
          .map((c) => {
            if (typeof c === 'string') return c;
            if (typeof c === 'object' && c !== null && 'transcript' in c && typeof (c as any).transcript === 'string') {
              return (c as any).transcript;
            }
            if (typeof c === 'object' && c !== null && 'text' in c && typeof (c as any).text === 'string') {
              return (c as any).text;
            }
            return '';
          })
          .filter(Boolean)
          .join(' ');
      }

      if (!text.trim()) return;

      if (chatMsg.role === 'assistant') {
        transcriptEntries.push({
          speaker: currentSpeaker,
          role: currentSpeaker === 'examiner' ? 'examiner' : 'peer',
          text: text.trim(),
          timestamp: chatMsg.createdAt || Date.now(),
        });
      } else if (chatMsg.role === 'user') {
        let speakerName = 'candidate';
        if (metadata.coCandidateMode === 'HUMAN_LOCAL') {
          // Deepgram Speaker 0 vs Speaker 1 diarization
          speakerName =
            lastUserSpeakerId === '1' ||
            lastUserSpeakerId === 'speaker_1' ||
            lastUserSpeakerId === 'CANDIDATE_2'
              ? 'CANDIDATE_2'
              : 'CANDIDATE_1';
        }

        transcriptEntries.push({
          speaker: speakerName,
          role: 'user',
          text: text.trim(),
          timestamp: chatMsg.createdAt || Date.now(),
        });
      }
    });

    // 12. Listen for DataPacket from client for HUMAN_LOCAL mode (e.g. "END_DISCUSSION")
    ctx.room.on('dataReceived', (payload: Uint8Array) => {
      try {
        const text = new TextDecoder().decode(payload);
        const data = JSON.parse(text);
        if (data.action === 'END_DISCUSSION' && isPassiveModerator) {
          exitPassiveModerator('CLIENT_DATA_PACKET');
        }
      } catch {
        // Ignore unparseable or irrelevant data packets
      }
    });

    // 13. Direct Neon Database Persistence on Shutdown (ZERO Webhook Handshake)
    ctx.addShutdownCallback(async () => {
      console.log(`[Worker] Starting shutdown Neon transaction for session ${metadata.sessionId}`);

      // 1. Read usage summary
      const summary = usageCollector.getSummary();
      const sttAudioSeconds =
        (summary as any).sttAudioDuration ??
        (summary.sttAudioDurationMs ? summary.sttAudioDurationMs / 1000 : 0);

      // 2. Calculate estimated cost
      const costBreakdown = calculateEstimatedCostUsd({
        llmPromptTokens: summary.llmPromptTokens,
        llmCompletionTokens: summary.llmCompletionTokens,
        ttsCharacters: summary.ttsCharactersCount,
        sttAudioSeconds,
      });

      const estimatedCostUsd = costBreakdown.totalEstimatedCostUsdFormatted;
      const totalTokensUsed = summary.llmPromptTokens + summary.llmCompletionTokens;
      const secondsToDeduct = Math.ceil(sttAudioSeconds);

      // 3. Run atomic database transaction in Neon PostgreSQL
      await db.transaction(async (tx) => {
        // Insert REALTIME_VOICE_AGENT usage row into usageLedger
        await tx.insert(usageLedger).values({
          id: crypto.randomUUID(),
          sessionId: metadata.sessionId,
          userId: metadata.userId,
          llmPromptTokens: summary.llmPromptTokens,
          llmCompletionTokens: summary.llmCompletionTokens,
          ttsCharacters: summary.ttsCharactersCount,
          sttAudioSeconds: sttAudioSeconds.toFixed(2),
          estimatedCostUsd,
          createdAt: new Date(),
        });

        // Atomically deduct seconds from userQuotas and accumulate metrics
        await tx
          .insert(userQuotas)
          .values({
            userId: metadata.userId,
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

        // Update examSessions with complete transcript and COMPLETED status
        await tx
          .update(examSessions)
          .set({
            status: 'COMPLETED',
            transcriptJson: transcriptEntries,
            updatedAt: new Date(),
          })
          .where(eq(examSessions.id, metadata.sessionId));
      });

      console.log(`[Worker] Neon transaction completed for session ${metadata.sessionId}`);

      // 4. Directly grade transcript with gpt-4o via post-exam rubric evaluator (ZERO HTTP Webhook)
      try {
        await evaluateExamSession(metadata.sessionId);
        console.log(`[Worker] Post-exam evaluation saved to Neon for session ${metadata.sessionId}`);
      } catch (evalError) {
        console.error(
          `[Worker] Error during post-exam rubric evaluation for session ${metadata.sessionId}:`,
          evalError
        );
      }
    });

    // 14. Start the session in the room
    await session.start({
      agent: initialExaminer,
      room: ctx.room,
    });

    // 15. Initial greeting and introduction of Del 1
    session.say(
      `Hei og velkommen til muntlig prøve i norsk på nivå ${metadata.level}. Jeg er din sensor i dag. Vi begynner med del 1, som er en individuell monolog. Oppgaven din er: ${metadata.topic.monologuePromptNo}. Vær så god, du kan begynne når du er klar.`
    );
  },
});

// Run worker via CLI when executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
}
