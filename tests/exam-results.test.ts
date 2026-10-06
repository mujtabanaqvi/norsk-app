import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  ExamResultsResponse,
  CandidateEvaluation,
  ExamEvaluation,
  UsageLedgerEntry,
  AssessedLevel,
} from '../src/types/exam';

test('Exam Results: Polling completion criteria validates active vs completed evaluations', () => {
  const shouldContinuePolling = (status: string, evaluationJson: ExamEvaluation | null): boolean => {
    if (evaluationJson !== null) return false;
    if (status === 'COMPLETED' || status === 'FAILED') return false;
    return true;
  };

  // Active with null evaluation -> poll
  assert.equal(shouldContinuePolling('ACTIVE', null), true);

  // Active but evaluation already generated -> stop polling
  const mockEval: ExamEvaluation = {
    candidates: [
      {
        speakerRole: 'CANDIDATE_1',
        targetLevel: 'B1',
        assessedLevel: 'B1',
        passedTargetLevel: true,
        overallSummaryNo: 'Godt gjennomført.',
        overallSummaryEn: 'Well done.',
        criteriaScores: {
          formidlingOgFlyt: { score: 7, feedbackNo: 'God flyt', feedbackEn: 'Good fluency' },
          uttaleOgForstaelighet: { score: 6, feedbackNo: 'Klar uttale', feedbackEn: 'Clear pronunciation' },
          ordforrad: { score: 7, feedbackNo: 'Bra vokabular', feedbackEn: 'Good vocabulary' },
          grammatikkOgSetningsstruktur: { score: 6, feedbackNo: 'God grammatikk', feedbackEn: 'Good grammar' },
        },
        concreteCorrections: [],
      },
    ],
  };
  assert.equal(shouldContinuePolling('ACTIVE', mockEval), false);
  assert.equal(shouldContinuePolling('COMPLETED', mockEval), false);
  assert.equal(shouldContinuePolling('FAILED', null), false);
});

test('Exam Results: Dual candidate mode correctly detects 2 participants and separates scores', () => {
  const candidate1: CandidateEvaluation = {
    speakerRole: 'CANDIDATE_1',
    targetLevel: 'B2',
    assessedLevel: 'B2',
    passedTargetLevel: true,
    overallSummaryNo: 'Kandidat 1 oppfylte B2 kravene.',
    overallSummaryEn: 'Candidate 1 met B2 requirements.',
    criteriaScores: {
      formidlingOgFlyt: { score: 8, feedbackNo: 'Utmerket flyt', feedbackEn: 'Excellent fluency' },
      uttaleOgForstaelighet: { score: 8, feedbackNo: 'Klar uttale', feedbackEn: 'Clear pronunciation' },
      ordforrad: { score: 7, feedbackNo: 'Bredt vokabular', feedbackEn: 'Broad vocabulary' },
      grammatikkOgSetningsstruktur: { score: 8, feedbackNo: 'Presis V2', feedbackEn: 'Precise V2' },
    },
    concreteCorrections: [
      {
        originalQuote: 'I går jeg gikk...',
        correctedNorwegian: 'I går gikk jeg...',
        grammarOrVocabRule: 'V2-regelen: Inversjon etter tidsadverbial.',
      },
    ],
  };

  const candidate2: CandidateEvaluation = {
    speakerRole: 'CANDIDATE_2',
    targetLevel: 'B2',
    assessedLevel: 'B1',
    passedTargetLevel: false,
    overallSummaryNo: 'Kandidat 2 viste B1-nivå.',
    overallSummaryEn: 'Candidate 2 showed B1 level.',
    criteriaScores: {
      formidlingOgFlyt: { score: 5, feedbackNo: 'Noe nøling', feedbackEn: 'Some hesitation' },
      uttaleOgForstaelighet: { score: 6, feedbackNo: 'Forståelig', feedbackEn: 'Comprehensible' },
      ordforrad: { score: 5, feedbackNo: 'Enkelt vokabular', feedbackEn: 'Basic vocabulary' },
      grammatikkOgSetningsstruktur: { score: 4, feedbackNo: 'En del feil', feedbackEn: 'Some errors' },
    },
    concreteCorrections: [],
  };

  const dualEval: ExamEvaluation = {
    candidates: [candidate1, candidate2],
  };

  assert.equal(dualEval.candidates.length, 2);
  assert.equal(dualEval.candidates[0].passedTargetLevel, true);
  assert.equal(dualEval.candidates[1].passedTargetLevel, false);
  assert.equal(dualEval.candidates[0].assessedLevel, 'B2');
  assert.equal(dualEval.candidates[1].assessedLevel, 'B1');

  // Compute averages
  const calcAverage = (c: CandidateEvaluation) => {
    const scores = [
      c.criteriaScores.formidlingOgFlyt.score,
      c.criteriaScores.uttaleOgForstaelighet.score,
      c.criteriaScores.ordforrad.score,
      c.criteriaScores.grammatikkOgSetningsstruktur.score,
    ];
    return Number((scores.reduce((a, b) => a + b, 0) / 4).toFixed(1));
  };

  assert.equal(calcAverage(candidate1), 7.8);
  assert.equal(calcAverage(candidate2), 5.0);
});

test('Exam Results: Usage ledger metric aggregator computes totals and costs accurately', () => {
  const usage: UsageLedgerEntry[] = [
    {
      sessionId: 'sess-123',
      userId: 'usr-456',
      source: 'REALTIME_VOICE_AGENT',
      llmModel: 'gpt-4.1-mini',
      llmPromptTokens: 1200,
      llmCompletionTokens: 400,
      ttsCharacters: 1500,
      sttAudioSeconds: '65.50',
      estimatedCostUsd: '0.012500',
    },
    {
      sessionId: 'sess-123',
      userId: 'usr-456',
      source: 'POST_EXAM_RUBRIC_EVAL',
      llmModel: 'gpt-4o',
      llmPromptTokens: 2500,
      llmCompletionTokens: 800,
      ttsCharacters: 0,
      sttAudioSeconds: '0.00',
      estimatedCostUsd: '0.014250',
    },
  ];

  let totalTokens = 0;
  let totalTts = 0;
  let totalStt = 0;
  let totalCost = 0;

  for (const entry of usage) {
    totalTokens += entry.llmPromptTokens + entry.llmCompletionTokens;
    totalTts += entry.ttsCharacters;
    totalStt += parseFloat(String(entry.sttAudioSeconds));
    totalCost += parseFloat(String(entry.estimatedCostUsd));
  }

  assert.equal(totalTokens, 4900);
  assert.equal(totalTts, 1500);
  assert.equal(Math.round(totalStt), 66);
  assert.equal(totalCost.toFixed(4), '0.0268');
});

