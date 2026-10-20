import test from 'node:test';
import assert from 'node:assert/strict';
import type { AssessedLevel, CandidateEvaluation, ExamEvaluation } from '../src/types/exam';
import {
  buildOfflineCoach,
  computeProfileStats,
  groupRecurringMistakes,
  pickUserCandidate,
  rankWeakestCriteria,
  toHistoryItem,
  type ProfileSample,
} from '../src/lib/learning-profile-stats';

function candidate(
  scores: [number, number, number, number],
  opts: Partial<Pick<CandidateEvaluation, 'assessedLevel' | 'passedTargetLevel' | 'targetLevel' | 'concreteCorrections'>> = {}
): CandidateEvaluation {
  const [f, u, o, g] = scores;
  const c = (score: number) => ({ score, feedbackNo: 'x', feedbackEn: 'x' });
  return {
    speakerRole: 'CANDIDATE_1',
    targetLevel: opts.targetLevel ?? 'B1',
    assessedLevel: opts.assessedLevel ?? 'B1',
    passedTargetLevel: opts.passedTargetLevel ?? true,
    overallSummaryNo: 'Sammendrag',
    overallSummaryEn: 'Summary',
    criteriaScores: {
      formidlingOgFlyt: c(f),
      uttaleOgForstaelighet: c(u),
      ordforrad: c(o),
      grammatikkOgSetningsstruktur: c(g),
    },
    concreteCorrections: opts.concreteCorrections ?? [],
  };
}

const sample = (id: string, cand: CandidateEvaluation): ProfileSample => ({ sessionId: id, candidate: cand });

test('Learning profile: averages, pass rate and readiness over the window', () => {
  // newest first
  const samples = [
    sample('s1', candidate([6, 6, 6, 4])),
    sample('s2', candidate([6, 6, 6, 4], { passedTargetLevel: false, assessedLevel: 'Under B1' })),
    sample('s3', candidate([6, 6, 6, 4])),
  ];
  const stats = computeProfileStats(samples, 7);

  assert.equal(stats.sampleSize, 3);
  assert.equal(stats.testsTaken, 7);
  assert.equal(stats.criterionAverages.grammatikkOgSetningsstruktur, 4);
  assert.equal(stats.recentAvg, 5.5);
  assert.equal(stats.passRate, 0.67);
  assert.equal(stats.currentLevel, 'B1');
  assert.equal(stats.readinessPct, 100); // 5.5 / 5 capped
});

test('Learning profile: only the latest 5 exams are used', () => {
  const samples = Array.from({ length: 8 }, (_, i) => sample(`s${i}`, candidate(i < 5 ? [8, 8, 8, 8] : [2, 2, 2, 2])));
  const stats = computeProfileStats(samples);
  assert.equal(stats.sampleSize, 5);
  assert.equal(stats.testsTaken, 8);
  assert.equal(stats.recentAvg, 8);
});

test('Learning profile: trend compares the latest 2 with the earlier exams', () => {
  const samples = [
    sample('s1', candidate([8, 5, 5, 3])),
    sample('s2', candidate([8, 5, 5, 3])),
    sample('s3', candidate([5, 5, 5, 6])),
    sample('s4', candidate([5, 5, 5, 6])),
  ];
  const stats = computeProfileStats(samples);
  assert.equal(stats.criterionTrend.formidlingOgFlyt, 'up');
  assert.equal(stats.criterionTrend.ordforrad, 'flat');
  assert.equal(stats.criterionTrend.grammatikkOgSetningsstruktur, 'down');

  const single = computeProfileStats([samples[0]]);
  assert.equal(single.overallTrend, 'flat');
});

test('Learning profile: current level is the most frequent, ties go to the most recent', () => {
  const lv = (l: AssessedLevel) => candidate([6, 6, 6, 6], { assessedLevel: l });
  assert.equal(computeProfileStats([sample('a', lv('B2')), sample('b', lv('B1')), sample('c', lv('B1'))]).currentLevel, 'B1');
  assert.equal(computeProfileStats([sample('a', lv('B2')), sample('b', lv('B1'))]).currentLevel, 'B2');
});

test('Learning profile: readiness uses the B2 pass mark for B2 targets', () => {
  const stats = computeProfileStats([sample('a', candidate([6, 6, 6, 6], { targetLevel: 'B2' }))]);
  assert.equal(stats.targetLevel, 'B2');
  assert.equal(stats.readinessPct, 75);
});

test('Learning profile: insufficient-data evaluations are skipped and CANDIDATE_1 is the user', () => {
  const insufficient: ExamEvaluation = { candidates: [candidate([1, 1, 1, 1])], insufficientData: true };
  assert.equal(pickUserCandidate(insufficient), null);
  assert.equal(pickUserCandidate(null), null);

  const c2 = { ...candidate([9, 9, 9, 9]), speakerRole: 'CANDIDATE_2' as const };
  const dual: ExamEvaluation = { candidates: [c2, candidate([4, 4, 4, 4])] };
  assert.equal(pickUserCandidate(dual)?.criteriaScores.ordforrad.score, 4);
});

test('Learning profile: recurring mistakes are grouped by pattern, most frequent first', () => {
  const corr = (rule: string, quote: string) => ({ originalQuote: quote, correctedNorwegian: `${quote}!`, grammarOrVocabRule: rule });
  const samples = [
    sample('s1', candidate([5, 5, 5, 5], { concreteCorrections: [corr('V2-regelen: verbet på plass to', 'I dag jeg går')] })),
    sample('s2', candidate([5, 5, 5, 5], {
      concreteCorrections: [corr('Inversjon etter adverbial', 'Så jeg tror'), corr('Substantivkjønn: et hus', 'en hus')],
    })),
  ];
  const mistakes = groupRecurringMistakes(samples);
  assert.equal(mistakes.length, 2);
  assert.match(mistakes[0].pattern, /V2/);
  assert.equal(mistakes[0].example, 'I dag jeg går'); // newest example kept
  assert.match(mistakes[1].pattern, /kjønn/);
});

test('Learning profile: offline coach targets the weakest criteria', () => {
  const samples = [sample('s1', candidate([7, 6, 5, 3])), sample('s2', candidate([7, 6, 5, 4]))];
  const stats = computeProfileStats(samples);
  assert.deepEqual(rankWeakestCriteria(stats).slice(0, 2), ['grammatikkOgSetningsstruktur', 'ordforrad']);

  const coach = buildOfflineCoach(stats, samples);
  assert.equal(coach.focusAreas.length, 2);
  assert.equal(coach.focusAreas[0].criterion, 'grammatikkOgSetningsstruktur');
  assert.match(coach.strengths[0].en, /Fluency/);
  assert.ok(coach.statusNo.length > 0 && coach.statusEn.length > 0);
  assert.ok(coach.nextStepNo.length > 0 && coach.nextStepEn.length > 0);
});

test('Learning profile: history items summarise each session', () => {
  const base = {
    id: 'sess',
    level: 'B1' as const,
    coCandidateMode: 'AI_PEER' as const,
    startedAt: new Date('2026-10-01T10:00:00Z'),
    completedAt: new Date('2026-10-01T10:15:00Z'),
    title: 'Helse',
    themeTitleNo: null,
  };
  const pending = toHistoryItem({ ...base, evaluationJson: null });
  assert.equal(pending.pending, true);
  assert.equal(pending.avgScore, null);

  const done = toHistoryItem({ ...base, evaluationJson: { candidates: [candidate([6, 7, 5, 4], { passedTargetLevel: false })] } });
  assert.equal(done.pending, false);
  assert.equal(done.avgScore, 5.5);
  assert.equal(done.passed, false);
  assert.equal(done.criteriaScores?.uttaleOgForstaelighet, 7);
  assert.equal(done.completedAt, '2026-10-01T10:15:00.000Z');
});
