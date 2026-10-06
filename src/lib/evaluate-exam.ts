import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import OpenAI from 'openai';
import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { examSessions, ExamEvaluation, TranscriptEntry } from '../db/schema';

/**
 * Official HK-dir Norskprøven Muntlig B1/B2 Evaluation Prompt
 */
const SYSTEM_PROMPT = `
Du er en autorisert sensor for Norskprøven muntlig (B1-B2) i regi av Direktoratet for høyere utdanning og kompetanse (HK-dir).
Din oppgave er å vurdere kandidatens muntlige prestasjon basert på den fullstendige transkripsjonen fra eksamenssimulatoren.

Du skal evaluere kandidatens ytringer opp mot Europarådets nivåskala for språk (CEFR) med fokus på B1 og B2:
- B1 kjennetegn: Kan delta i enkle samtaler om kjente emner, gi korte begrunnelser, enkle bindeord (fordi, men, så), forståelig uttale med noe aksent, elementær grammatisk kontroll der feil ikke hindrer kommunikasjon.
- B2 kjennetegn: Kan uttrykke seg klart og nyansert, delta spontant i diskusjoner, drøfte fordeler og ulemper, presist og variert ordforråd, god kontroll over leddsetninger, V2-regelen (inversjon) og preposisjoner.

Returner et strukturert JSON-objekt med nøyaktig følgende skjema:
{
  "overallLevel": "Under B1" | "B1" | "B2" | "Over B2",
  "passedTargetLevel": boolean,
  "summary": "Overordnet vurdering på norsk (2-4 avsnitt)",
  "criteria": {
    "uttale": {
      "score": number (1-5),
      "levelAchieved": "Under B1" | "B1" | "B2" | "Over B2",
      "feedback": "Vurdering av uttale og intonasjon",
      "evidence": ["Sitater eller eksempler"]
    },
    "flyt": {
      "score": number (1-5),
      "levelAchieved": "Under B1" | "B1" | "B2" | "Over B2",
      "feedback": "Vurdering av talehastighet, nøling og turtaking",
      "evidence": ["Sitater eller eksempler"]
    },
    "ordforrad": {
      "score": number (1-5),
      "levelAchieved": "Under B1" | "B1" | "B2" | "Over B2",
      "feedback": "Vurdering av bredde, variasjon og presisjon i ordforråd",
      "evidence": ["Sitater eller eksempler"]
    },
    "grammatikk": {
      "score": number (1-5),
      "levelAchieved": "Under B1" | "B1" | "B2" | "Over B2",
      "feedback": "Vurdering av setningsstruktur, V2, leddsetninger, bøyning",
      "evidence": ["Sitater eller eksempler"]
    },
    "sammenheng": {
      "score": number (1-5),
      "levelAchieved": "Under B1" | "B1" | "B2" | "Over B2",
      "feedback": "Vurdering av sammenheng, bindeord og svar på oppgaven",
      "evidence": ["Sitater eller eksempler"]
    }
  },
  "keyCorrections": [
    {
      "candidateSaid": "Hva kandidaten sa feil",
      "correction": "Riktig formulering på norsk",
      "explanation": "Grammatisk forklaring (f.eks. inversjon, preposisjon, ordvalg)"
    }
  ]
}
`;

/**
 * Directly grades the exam session transcript stored in Neon using OpenAI gpt-4o,
 * persists the resulting evaluation JSON directly into examSessions, and returns it.
 */
export async function evaluateExamSession(sessionId: string): Promise<ExamEvaluation> {
  console.log(`[Evaluation] Starting direct evaluation for exam session ${sessionId}`);

  const [session] = await db
    .select()
    .from(examSessions)
    .where(eq(examSessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw new Error(`Exam session with ID "${sessionId}" not found.`);
  }

  const transcript = (session.transcriptJson as TranscriptEntry[]) || [];
  const level = session.level as 'B1' | 'B2';
  const topic = session.topic;

  // Filter candidate utterances (including CANDIDATE_1 and CANDIDATE_2 for HUMAN_LOCAL)
  const candidateUtterances = transcript.filter(
    (t) =>
      t.role === 'user' ||
      t.speaker === 'candidate' ||
      t.speaker === 'CANDIDATE_1' ||
      t.speaker === 'CANDIDATE_2'
  );

  if (candidateUtterances.length === 0) {
    console.warn(`[Evaluation] No candidate utterances recorded for session ${sessionId}`);
    const emptyEvaluation: ExamEvaluation = {
      overallLevel: 'Under B1',
      passedTargetLevel: false,
      summary: 'Ingen ytringer fra kandidaten ble registrert i løpet av samtalen.',
      criteria: {
        uttale: { score: 1, levelAchieved: 'Under B1', feedback: 'Ingen tale registrert.', evidence: [] },
        flyt: { score: 1, levelAchieved: 'Under B1', feedback: 'Ingen tale registrert.', evidence: [] },
        ordforrad: { score: 1, levelAchieved: 'Under B1', feedback: 'Ingen ordforråd registrert.', evidence: [] },
        grammatikk: { score: 1, levelAchieved: 'Under B1', feedback: 'Ingen grammatiske ytringer.', evidence: [] },
        sammenheng: { score: 1, levelAchieved: 'Under B1', feedback: 'Ingen interaksjon.', evidence: [] },
      },
      keyCorrections: [],
      evaluatedAt: new Date().toISOString(),
    };

    await db
      .update(examSessions)
      .set({ evaluationJson: emptyEvaluation, updatedAt: new Date() })
      .where(eq(examSessions.id, sessionId));

    return emptyEvaluation;
  }

  let evaluation: ExamEvaluation;
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey && apiKey !== 'sk-xxxxxxx' && !apiKey.startsWith('sk-placeholder')) {
    const openai = new OpenAI({ apiKey });
    const transcriptText = transcript
      .map((entry) => `[${entry.speaker ?? entry.role}]: ${entry.text}`)
      .join('\n');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Målnivå: ${level}\nTema: ${topic}\n\nTranskripsjon:\n${transcriptText}`,
        },
      ],
      temperature: 0.2,
    });

    const rawJson = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(rawJson);

    evaluation = {
      ...parsed,
      evaluatedAt: new Date().toISOString(),
    };
  } else {
    // Robust fallback rubric generator for development / sandbox testing
    console.log(`[Evaluation] Generating rule-based rubric evaluation for session ${sessionId}`);
    const totalWords = candidateUtterances.reduce(
      (acc, u) => acc + u.text.trim().split(/\s+/).length,
      0
    );

    const passed = totalWords >= 40;
    const achieved = passed ? (level === 'B2' ? 'B2' : 'B1') : 'Under B1';

    evaluation = {
      overallLevel: achieved,
      passedTargetLevel: passed,
      summary: `Kandidaten gjennomførte en muntlig prøve om temaet "${topic}" på målnivå ${level}. Kandidaten produserte ${totalWords} ord fordelt på ${candidateUtterances.length} ytringer.`,
      criteria: {
        uttale: {
          score: passed ? 4 : 2,
          levelAchieved: achieved,
          feedback: 'Tydelig uttale med god intonasjon.',
          evidence: candidateUtterances.slice(0, 2).map((u) => u.text),
        },
        flyt: {
          score: passed ? 3 : 2,
          levelAchieved: achieved,
          feedback: 'Akseptabel flyt med naturlige pauser for planlegging.',
          evidence: [],
        },
        ordforrad: {
          score: passed ? 4 : 2,
          levelAchieved: achieved,
          feedback: 'Godt ordforråd tilpasset temaet.',
          evidence: [],
        },
        grammatikk: {
          score: passed ? 3 : 2,
          levelAchieved: achieved,
          feedback: 'God kontroll over setningsstrukturer med enkelte V2-feil.',
          evidence: [],
        },
        sammenheng: {
          score: passed ? 4 : 2,
          levelAchieved: achieved,
          feedback: 'God evne til å svare på spørsmål og ta turtaking.',
          evidence: [],
        },
      },
      keyCorrections: [
        {
          candidateSaid: 'Jeg tror at det er viktig fordi...',
          correction: 'Jeg mener at det er viktig fordi...',
          explanation: 'På B1/B2 er "jeg mener" mer presist enn "jeg tror" ved meningsytringer.',
        },
      ],
      evaluatedAt: new Date().toISOString(),
    };
  }

  // Persist evaluation directly to Neon DB
  await db
    .update(examSessions)
    .set({
      evaluationJson: evaluation,
      updatedAt: new Date(),
    })
    .where(eq(examSessions.id, sessionId));

  console.log(`[Evaluation] Direct Neon evaluation persisted for session ${sessionId}`);
  return evaluation;
}

