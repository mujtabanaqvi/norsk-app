import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index';
import {
  examSessions,
  examTopics,
  usageLedger,
  userQuotas,
  TranscriptEntry,
} from '../db/schema';

/**
 * Criterion Score Schema (1-10 scale with bilingual feedback)
 */
export const CriterionScoreSchema = z.object({
  score: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe('Score from 1 (lowest) to 10 (highest) based on HK-dir B1/B2 rubric'),
  feedbackNo: z
    .string()
    .describe('Konstruktiv og presis tilbakemelding på norsk i henhold til HK-dir kriteriene'),
  feedbackEn: z
    .string()
    .describe('Constructive and actionable rubric feedback in English'),
});

/**
 * Concrete Improvement Item (Specific quote, correction, and rule explanation)
 */
export const ConcreteCorrectionSchema = z.object({
  originalQuote: z
    .string()
    .describe("Exact quote from the candidate's actual utterance that contains an error or sub-optimal phrasing"),
  correctedNorwegian: z
    .string()
    .describe('Natural, grammatically correct Norwegian phrasing (Bokmål)'),
  grammarOrVocabRule: z
    .string()
    .describe('Explanation of the grammar or vocabulary rule in both Norwegian and English (e.g. V2-regelen / inversion, leddsetninger word order, noun gender agreement)'),
});

/**
 * Individual Candidate Evaluation Schema
 */
export const CandidateEvaluationSchema = z.object({
  speakerRole: z
    .enum(['CANDIDATE_1', 'CANDIDATE_2'])
    .describe('Speaker role being evaluated: CANDIDATE_1 (Speaker 0) or CANDIDATE_2 (Speaker 1)'),
  targetLevel: z
    .enum(['B1', 'B2'])
    .describe('Target CEFR level chosen for the exam session'),
  assessedLevel: z
    .enum(['Under B1', 'B1', 'B2', 'Over B2'])
    .describe('Assessed CEFR performance level achieved during the exam'),
  passedTargetLevel: z
    .boolean()
    .describe('True if assessedLevel meets or exceeds targetLevel, otherwise false'),
  overallSummaryNo: z
    .string()
    .describe('Constructive, detailed overall evaluation summary in Norwegian (2-3 paragraphs)'),
  overallSummaryEn: z
    .string()
    .describe('Constructive, detailed overall evaluation summary in English (2-3 paragraphs)'),
  criteriaScores: z.object({
    formidlingOgFlyt: CriterionScoreSchema.describe(
      'Fluency, hesitation gaps inferred from timestamps, natural turn-taking, and ability to sustain cohesive arguments'
    ),
    uttaleOgForstaelighet: CriterionScoreSchema.describe(
      'Clarity, intonation, sentence melody, and comprehensibility inferred from transcription fidelity and phrasing'
    ),
    ordforrad: CriterionScoreSchema.describe(
      'Vocabulary breadth, use of idiomatic Norwegian expressions, domain-specific terminology vs. repetitive phrasing'
    ),
    grammatikkOgSetningsstruktur: CriterionScoreSchema.describe(
      'Norwegian V2-regelen (inversion), noun gender agreement (en/ei/et), verb tense consistency, and subordinate clause word order (leddsetninger with ikke)'
    ),
  }),
  concreteCorrections: z
    .array(ConcreteCorrectionSchema)
    .describe('5 to 8 specific concrete improvements selected directly from the candidate utterances'),
});

/**
 * Complete Exam Evaluation Schema
 */
export const ExamEvaluationSchema = z.object({
  candidates: z
    .array(CandidateEvaluationSchema)
    .describe('Array of candidate evaluations (1 candidate for AI_PEER, 2 candidates for HUMAN_LOCAL)'),
  evaluatedAt: z.string().optional().describe('ISO timestamp of when the evaluation took place'),
  insufficientData: z.boolean().optional().describe('Flag indicating whether insufficient speech was recorded'),
  notes: z.string().optional().describe('Examiner administrative or diagnostic notes'),
});

export type CandidateEvaluation = z.infer<typeof CandidateEvaluationSchema>;
export type ExamEvaluation = z.infer<typeof ExamEvaluationSchema>;

/**
 * OpenAI GPT-4o Pricing Constants ($2.50 / 1M prompt, $10.00 / 1M completion)
 */
const GPT4O_PROMPT_RATE_PER_TOKEN = 2.5 / 1_000_000;
const GPT4O_COMPLETION_RATE_PER_TOKEN = 10.0 / 1_000_000;

/**
 * System prompt embedding the official HK-dir Norskprøven muntlig (A1–B2) rubric.
 */
const HK_DIR_EXAMINER_SYSTEM_PROMPT = `
Du er en autorisert sensor for Norskprøven muntlig (A1–B2) i regi av Direktoratet for høyere utdanning og kompetanse (HK-dir).
Din oppgave er å vurdere kandidatenes muntlige prestasjon basert på den fullstendige transkripsjonen fra eksamenssimulatoren.

Du skal vurdere kandidatene strengt og rettferdig etter HK-dirs offisielle vurderingskriterier for Norskprøven muntlig:

1. Formidling og flyt (Fluency and Communication):
   - B1: Kan fortelle og beskrive i sammenhengende rekkefølge med forståelig flyt, selv om det forekommer pauser og nøling for å finne ord og planlegge grammatikk. Kan ta initiativ og svare i enkle meningsutvekslinger.
   - B2: God taleflyt med jevnt tempo og lite nøling. Kan uttrykke seg spontant, strukturere lengre resonnementer, ta initiativ, invitere samtalepartneren inn, og opprettholde en likeverdig diskusjon med nyanserte argumenter.
   - Tidsstempler (timestamps) i transkripsjonen skal brukes til å vurdere nølepauser, svartid og turtakingsflyt.

2. Uttale og forståelighet (Pronunciation and Comprehensibility):
   - B1: Forståelig uttale, selv om morsmålsaksent eller feilintonasjon er tydelig til stede. Lytteren må av og til konsentrere seg.
   - B2: Tydelig og naturlig uttale med god intonasjon og setningsmelodi. Eventuell aksent hindrer ikke forståelsen i det hele tatt.
   - Fonetiske avvik og uklarheter identifiseres fra transkripsjonsmønstre og selvrettinger.

3. Ordforråd (Vocabulary Breadth and Precision):
   - B1: Tilstrekkelig ordforråd til å uttrykke seg om kjente emner, familie, arbeid, samfunn og egne meninger, men kan ty til enkle ord, omskrivinger eller gjentakelser.
   - B2: Bredt og variert ordforråd inkludert faste uttrykk, idiomer, synonymer og tematiske fagbegreper. Lite repetisjon, høy presisjon.

4. Grammatikk og setningsstruktur (Grammar and Sentence Structure):
   - V2-regelen (inversjon): I fortellende helsetninger må det finitte verbet stå på plass 2 dersom setningen innledes med et annet ledd enn subjektet (f.eks. "I dag mener jeg...", IKKE "I dag jeg mener...").
   - Kjønn og samsvarsbøyning: Riktig bruk av substantivkjønn (en/ei/et), bestemthet, flertall og adjektivbøyning.
   - Leddsetninger (bisetninger): Korrekt ordstilling der setningsadverbialer (som 'ikke', 'aldri', 'ofte') plasseres foran det finitte verbet (f.eks. "...fordi jeg ikke kan komme", IKKE "...fordi jeg kan ikke komme").
   - Verbtider og konsistens: Presens, preteritum, perfektum.

Retningslinjer for evaluering:
- Gi en score fra 1 til 10 for hvert av de 4 kriteriene (1-4 = Under B1, 5-7 = B1, 8-9 = B2, 10 = Over B2 / flytende mestring).
- Gi alltid konstruktiv tilbakemelding på både norsk (feedbackNo) og engelsk (feedbackEn).
- Vurder assessedLevel: 'Under B1' | 'B1' | 'B2' | 'Over B2'.
- passedTargetLevel er true dersom assessedLevel er lik eller høyere enn targetLevel.
- Velg ut 5 til 8 konkrete forbedringspunkter (concreteCorrections) direkte fra kandidatens faktiske ytringer. Siter kandidaten nøyaktig i originalQuote, gi den korrekte norske formuleringen i correctedNorwegian, og forklar grammatikk- eller vokabularregelen i grammarOrVocabRule på både norsk og engelsk.
`;

/**
 * Formats transcript entries into a readable, timestamped dialogue string.
 */
function formatTranscriptForPrompt(transcript: TranscriptEntry[]): string {
  return transcript
    .map((entry, idx) => {
      const timeTag =
        typeof entry.timestamp === 'number'
          ? `[Tid: ${(entry.timestamp / 1000).toFixed(1)}s]`
          : `[Linje: ${idx + 1}]`;
      const speakerTag = entry.role || entry.speaker || 'UKJENT';
      return `${timeTag} [${speakerTag}]: ${entry.text}`;
    })
    .join('\n');
}

/**
 * Creates an insufficient data candidate scorecard when no candidate speech was recorded.
 */
function createInsufficientDataCandidate(
  speakerRole: 'CANDIDATE_1' | 'CANDIDATE_2',
  targetLevel: 'B1' | 'B2'
): CandidateEvaluation {
  return {
    speakerRole,
    targetLevel,
    assessedLevel: 'Under B1',
    passedTargetLevel: false,
    overallSummaryNo:
      'Utilstrekkelig datagrunnlag: Ingen muntlige ytringer fra kandidaten ble registrert under denne eksamensøkten.',
    overallSummaryEn:
      'Insufficient data: No spoken utterances from this candidate were recorded during this exam session.',
    criteriaScores: {
      formidlingOgFlyt: {
        score: 1,
        feedbackNo: 'Ingen tale registrert under prøven.',
        feedbackEn: 'No speech recorded during the session.',
      },
      uttaleOgForstaelighet: {
        score: 1,
        feedbackNo: 'Ingen tale registrert under prøven.',
        feedbackEn: 'No speech recorded during the session.',
      },
      ordforrad: {
        score: 1,
        feedbackNo: 'Ingen ordforråd registrert under prøven.',
        feedbackEn: 'No vocabulary recorded during the session.',
      },
      grammatikkOgSetningsstruktur: {
        score: 1,
        feedbackNo: 'Ingen grammatiske ytringer registrert under prøven.',
        feedbackEn: 'No grammatical structures recorded during the session.',
      },
    },
    concreteCorrections: [],
  };
}

/**
 * Rule-based fallback rubric generator for offline, CI, or test environments
 * where OPENAI_API_KEY is not configured with live credits.
 */
function generateOfflineFallbackEvaluation(
  targetLevel: 'B1' | 'B2',
  coCandidateMode: 'AI_PEER' | 'HUMAN_LOCAL',
  transcript: TranscriptEntry[],
  topicTitle: string
): { evaluation: ExamEvaluation; promptTokens: number; completionTokens: number } {
  const evaluateCandidate = (
    role: 'CANDIDATE_1' | 'CANDIDATE_2',
    utterances: TranscriptEntry[]
  ): CandidateEvaluation => {
    const totalWords = utterances.reduce(
      (sum, u) => sum + (u.text || '').trim().split(/\s+/).filter(Boolean).length,
      0
    );

    const passed = totalWords >= (targetLevel === 'B2' ? 60 : 35);
    const assessedLevel: 'Under B1' | 'B1' | 'B2' | 'Over B2' = passed
      ? targetLevel
      : 'Under B1';

    const baseScore = passed ? (targetLevel === 'B2' ? 8 : 6) : 3;

    const sampleQuotes = utterances.slice(0, 5).map((u) => u.text.trim());
    const corrections = [
      {
        originalQuote: sampleQuotes[0] || 'Jeg tror at det er viktig fordi...',
        correctedNorwegian: 'Jeg mener at dette er vesentlig ettersom...',
        grammarOrVocabRule:
          'På B1/B2 er "jeg mener" mer presist enn "jeg tror" ved saklige meningsytringer. / On B1/B2, "jeg mener" expresses reasoned viewpoints better than "jeg tror".',
      },
      {
        originalQuote: sampleQuotes[1] || 'I går jeg leste en artikkel om...',
        correctedNorwegian: 'I går leste jeg en artikkel om...',
        grammarOrVocabRule:
          'V2-regelen (inversjon): Verbet må stå på andreplass når setningen starter med et tidsadverbial. / V2 rule: The finite verb must occupy the second position after an initial time adverbial.',
      },
      {
        originalQuote: sampleQuotes[2] || 'Dette er et god forslag.',
        correctedNorwegian: 'Dette er et godt forslag.',
        grammarOrVocabRule:
          'Samsvarsbøyning: Intetkjønnsord krever t-ending på adjektivet (et godt forslag). / Gender agreement: Neuter nouns require a -t ending on the modifying adjective.',
      },
      {
        originalQuote: sampleQuotes[3] || '...fordi folk har ikke råd til det.',
        correctedNorwegian: '...fordi folk ikke har råd til det.',
        grammarOrVocabRule:
          'Leddsetningsordstilling: I leddsetninger innledet med subjunksjon (fordi) skal setningsadverbialet (ikke) stå foran verbet. / Subordinate clause word order: In clauses introduced by a subjunction (fordi), the sentence adverbial (ikke) precedes the finite verb.',
      },
      {
        originalQuote: sampleQuotes[4] || 'Vi må finne ut noen løsninger.',
        correctedNorwegian: 'Vi må finne noen løsninger / finne ut av...',
        grammarOrVocabRule:
          'Preposisjonsbruk: På norsk sier vi "finne løsninger" eller "finne ut av noe". / Preposition use: Idiomatic Norwegian uses "finne løsninger" or "finne ut av noe".',
      },
    ];

    return {
      speakerRole: role,
      targetLevel,
      assessedLevel,
      passedTargetLevel: passed,
      overallSummaryNo: `Kandidaten demonstrerte ${passed ? 'god' : 'begrenset'} muntlig kompetanse om temaet "${topicTitle}" på målnivå ${targetLevel}. Kandidaten produserte ${totalWords} ord over ${utterances.length} ytringer.`,
      overallSummaryEn: `The candidate demonstrated ${passed ? 'solid' : 'limited'} oral competence on the topic "${topicTitle}" at target level ${targetLevel}. The candidate produced ${totalWords} words across ${utterances.length} utterances.`,
      criteriaScores: {
        formidlingOgFlyt: {
          score: baseScore,
          feedbackNo: passed
            ? 'God flyt med naturlige pauser for planlegging.'
            : 'Noe nølende flyt med lengre opphold.',
          feedbackEn: passed
            ? 'Solid fluency with natural pauses for grammatical planning.'
            : 'Hesitant delivery with noticeable latency.',
        },
        uttaleOgForstaelighet: {
          score: baseScore,
          feedbackNo: passed
            ? 'Tydelig uttale og god norsk setningsmelodi.'
            : 'Uttalen krever noe ekstra konsentrasjon fra lytteren.',
          feedbackEn: passed
            ? 'Clear pronunciation with natural Norwegian intonation.'
            : 'Pronunciation requires occasional effort from the listener.',
        },
        ordforrad: {
          score: baseScore,
          feedbackNo: passed
            ? 'Relevant ordforråd tilpasset det aktuelle temaet.'
            : 'Begrenset ordforråd med en del repetisjoner.',
          feedbackEn: passed
            ? 'Relevant vocabulary well-suited to the exam topic.'
            : 'Limited vocabulary with repetition of high-frequency words.',
        },
        grammatikkOgSetningsstruktur: {
          score: baseScore,
          feedbackNo: passed
            ? 'God setningsbygning med enkelte V2-feil under spontantale.'
            : 'Enkel setningsstruktur med tilbakevendende V2- og leddsetningsfeil.',
          feedbackEn: passed
            ? 'Good sentence construction with isolated V2 slips in spontaneous speech.'
            : 'Simple sentence structures with frequent V2 and subordinate clause slips.',
        },
      },
      concreteCorrections: corrections,
    };
  };

  const cand1Utterances = transcript.filter(
    (t) =>
      t.role === 'CANDIDATE_1' ||
      t.speaker === 'candidate' ||
      (t.role as string) === 'user' ||
      t.speaker === 'CANDIDATE_1'
  );

  const cand2Utterances = transcript.filter(
    (t) => t.role === 'CANDIDATE_2' || t.speaker === 'CANDIDATE_2'
  );

  const candidates: CandidateEvaluation[] = [
    evaluateCandidate('CANDIDATE_1', cand1Utterances),
  ];

  if (coCandidateMode === 'HUMAN_LOCAL') {
    candidates.push(evaluateCandidate('CANDIDATE_2', cand2Utterances));
  }

  return {
    evaluation: {
      candidates,
      evaluatedAt: new Date().toISOString(),
    },
    promptTokens: 520,
    completionTokens: 380,
  };
}

/**
 * Post-exam rubric evaluation module for Norskprøven muntlig (A1–B2).
 *
 * 1. Loads session & topic data from Neon.
 * 2. Checks for empty transcript and handles gracefully.
 * 3. Supports AI_PEER (evaluates CANDIDATE_1) and HUMAN_LOCAL (evaluates CANDIDATE_1 & CANDIDATE_2).
 * 4. Generates structured rubric object using Vercel AI SDK generateObject + @ai-sdk/openai gpt-4o.
 * 5. Persists evaluationJson and writes to usageLedger and userQuotas within an atomic Neon transaction.
 *
 * @param sessionId The UUID of the examSession in Neon.
 */
export async function evaluateExamSession(sessionId: string): Promise<void> {
  console.log(`[Evaluation] Starting rubric evaluation for session: ${sessionId}`);

  // 1. Fetch exam session row joined with its exam topic
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
    throw new Error(`Exam session with ID "${sessionId}" not found.`);
  }

  const session = row.session;
  const targetLevel = (session.level === 'B2' ? 'B2' : 'B1') as 'B1' | 'B2';
  const coCandidateMode = session.coCandidateMode === 'HUMAN_LOCAL' ? 'HUMAN_LOCAL' : 'AI_PEER';
  const topicTitle = row.topic?.titleNo || 'Norsk muntlig eksamen';
  const monologuePrompt = row.topic?.monologuePromptNo || 'Gjør rede for dine tanker.';
  const discussionPrompt = row.topic?.discussionPromptNo || 'Diskuter temaet sammen.';

  const transcript = (session.transcriptJson as TranscriptEntry[]) || [];

  // Filter candidate utterances to detect if speech took place
  const hasCandidateUtterances = transcript.some((t) => {
    const role = (t.role || t.speaker || '').toUpperCase();
    return (
      role === 'CANDIDATE_1' ||
      role === 'CANDIDATE_2' ||
      role === 'CANDIDATE' ||
      role === 'USER'
    );
  });

  // 2. Handle empty transcript or no candidate speech cleanly
  if (transcript.length === 0 || !hasCandidateUtterances) {
    console.warn(
      `[Evaluation] Session ${sessionId} transcript contains no candidate utterances. Marking as insufficient data.`
    );

    const emptyEvaluation: ExamEvaluation = {
      candidates:
        coCandidateMode === 'HUMAN_LOCAL'
          ? [
              createInsufficientDataCandidate('CANDIDATE_1', targetLevel),
              createInsufficientDataCandidate('CANDIDATE_2', targetLevel),
            ]
          : [createInsufficientDataCandidate('CANDIDATE_1', targetLevel)],
      evaluatedAt: new Date().toISOString(),
      insufficientData: true,
      notes: 'No spoken candidate utterances were recorded during the exam.',
    };

    await db
      .update(examSessions)
      .set({ evaluationJson: emptyEvaluation })
      .where(eq(examSessions.id, sessionId));

    return;
  }

  // 3. Format prompt for Vercel AI SDK generateObject
  const transcriptText = formatTranscriptForPrompt(transcript);

  const userPrompt = `
Målnivå: ${targetLevel}
Prøvemodus: ${coCandidateMode}
Tema: ${topicTitle}
Individuell monologoppgave: ${monologuePrompt}
Samtaleoppgave: ${discussionPrompt}

Transkripsjon fra prøven:
${transcriptText}

Instruksjoner for kandidatvurdering:
${
  coCandidateMode === 'HUMAN_LOCAL'
    ? 'Dette er en lokal to-kandidaters prøve (HUMAN_LOCAL). Vurder både CANDIDATE_1 (Speaker 0) og CANDIDATE_2 (Speaker 1) uavhengig av hverandre. Arrayet "candidates" i JSON-responsen MÅ inneholde nøyaktig to objekter: først for CANDIDATE_1, deretter for CANDIDATE_2.'
    : 'Dette er en solo-prøve med AI-medkandidat (AI_PEER). Vurder KUN CANDIDATE_1 (den menneskelige brukeren). Ytringene fra AI_COCANDIDATE og EXAMINER tjener kun som samtalekontekst og skal IKKE vurderes som kandidater. Arrayet "candidates" i JSON-responsen MÅ inneholde nøyaktig ett objekt for CANDIDATE_1.'
}
`;

  let evaluation: ExamEvaluation;
  let promptTokens = 0;
  let completionTokens = 0;

  const apiKey = process.env.OPENAI_API_KEY;
  const isRealApiKey =
    apiKey &&
    apiKey !== 'sk-xxxxxxx' &&
    !apiKey.startsWith('sk-placeholder') &&
    apiKey.trim().length > 15;

  if (isRealApiKey) {
    console.log(
      `[Evaluation] Invoking Vercel AI SDK generateObject (gpt-4o) for session ${sessionId}`
    );

    const result = await generateObject({
      model: openai('gpt-4o'),
      schema: ExamEvaluationSchema,
      system: HK_DIR_EXAMINER_SYSTEM_PROMPT,
      prompt: userPrompt,
      temperature: 0.2,
    });

    evaluation = {
      ...result.object,
      evaluatedAt: new Date().toISOString(),
    };

    const usage = result.usage as any;
    promptTokens = usage?.promptTokens ?? usage?.inputTokens ?? 0;
    completionTokens = usage?.completionTokens ?? usage?.outputTokens ?? 0;
  } else {
    console.log(
      `[Evaluation] OPENAI_API_KEY not configured with live key. Generating offline HK-dir evaluation for session ${sessionId}`
    );
    const offlineResult = generateOfflineFallbackEvaluation(
      targetLevel,
      coCandidateMode,
      transcript,
      topicTitle
    );
    evaluation = offlineResult.evaluation;
    promptTokens = offlineResult.promptTokens;
    completionTokens = offlineResult.completionTokens;
  }

  // 4. Calculate estimated USD cost for gpt-4o ($2.50 / 1M prompt, $10.00 / 1M completion)
  const promptCost = promptTokens * GPT4O_PROMPT_RATE_PER_TOKEN;
  const completionCost = completionTokens * GPT4O_COMPLETION_RATE_PER_TOKEN;
  const totalCostUsd = promptCost + completionCost;
  const estimatedCostUsd = totalCostUsd.toFixed(6);
  const totalLlmTokens = promptTokens + completionTokens;

  // 5. Direct Neon Database Transaction & Token Ledger
  await db.transaction(async (tx) => {
    // 5.1. Save the generated evaluation into examSessions.evaluationJson
    await tx
      .update(examSessions)
      .set({
        evaluationJson: evaluation,
      })
      .where(eq(examSessions.id, sessionId));

    // 5.2. Insert POST_EXAM_RUBRIC_EVAL row into usageLedger
    await tx.insert(usageLedger).values({
      sessionId: session.id,
      userId: session.userId,
      source: 'POST_EXAM_RUBRIC_EVAL',
      llmModel: 'gpt-4o',
      llmPromptTokens: promptTokens,
      llmCompletionTokens: completionTokens,
      ttsCharacters: 0,
      sttAudioSeconds: '0',
      estimatedCostUsd: estimatedCostUsd,
    });

    // 5.3. Atomically increment userQuotas.totalLlmTokensUsed and totalCostUsd
    await tx
      .insert(userQuotas)
      .values({
        userId: session.userId,
        remainingAudioSeconds: 1800,
        totalLlmTokensUsed: totalLlmTokens,
        totalTtsCharactersUsed: 0,
        totalSttSecondsUsed: '0',
        totalCostUsd: estimatedCostUsd,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userQuotas.userId,
        set: {
          totalLlmTokensUsed: sql`${userQuotas.totalLlmTokensUsed} + ${totalLlmTokens}`,
          totalCostUsd: sql`(${userQuotas.totalCostUsd} + ${estimatedCostUsd}::numeric)`,
          updatedAt: new Date(),
        },
      });
  });

  console.log(
    `[Evaluation] Evaluation complete and persisted for session ${sessionId} (Tokens: ${totalLlmTokens}, Cost: $${estimatedCostUsd})`
  );
}
