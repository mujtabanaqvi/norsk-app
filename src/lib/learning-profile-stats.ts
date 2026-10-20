/**
 * Pure learning-profile maths: rolling stats over the latest evaluations and the
 * rule-based coach used when no LLM is available. No database access here, so it can
 * be unit-tested and shared.
 */
import type { AssessedLevel, CandidateEvaluation, CefrLevel, ExamEvaluation } from '../types/exam';
import {
  CRITERION_KEYS,
  type CoachFocusArea,
  type CoachMistake,
  type CriterionKey,
  type ExamHistoryItem,
  type LearningCoach,
  type LearningProfileStats,
  type Trend,
} from '../types/learning-profile';

/** Number of recent exams the profile summarises */
export const PROFILE_WINDOW = 5;

/** Average criterion score needed to pass each target level (HK-dir: 5–7 = B1, 8–9 = B2) */
export const PASS_MARK: Record<CefrLevel, number> = { B1: 5, B2: 8 };

const TREND_THRESHOLD = 0.5;

const LEVEL_ORDER: AssessedLevel[] = ['Under B1', 'B1', 'B2', 'Over B2'];

export const CRITERION_TITLES: Record<CriterionKey, { no: string; en: string }> = {
  formidlingOgFlyt: { no: 'Formidling og flyt', en: 'Fluency & cohesion' },
  uttaleOgForstaelighet: { no: 'Uttale og forståelighet', en: 'Pronunciation' },
  ordforrad: { no: 'Ordforråd', en: 'Vocabulary' },
  grammatikkOgSetningsstruktur: { no: 'Grammatikk og setningsstruktur', en: 'Grammar & sentence structure' },
};

/** One evaluated exam, newest first when passed in a list */
export interface ProfileSample {
  sessionId: string;
  candidate: CandidateEvaluation;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** The user's own scorecard: CANDIDATE_1 in both AI_PEER and HUMAN_LOCAL mode. */
export function pickUserCandidate(evaluation: ExamEvaluation | null | undefined): CandidateEvaluation | null {
  if (!evaluation || evaluation.insufficientData || !evaluation.candidates?.length) return null;
  return evaluation.candidates.find((c) => c.speakerRole === 'CANDIDATE_1') ?? evaluation.candidates[0];
}

export function candidateAverage(c: CandidateEvaluation): number {
  return round1(mean(CRITERION_KEYS.map((k) => c.criteriaScores[k].score)));
}

function trendOf(recent: number, earlier: number): Trend {
  const diff = recent - earlier;
  if (diff >= TREND_THRESHOLD) return 'up';
  if (diff <= -TREND_THRESHOLD) return 'down';
  return 'flat';
}

/** Split newest-first samples into "latest" and "earlier" halves for trend comparison. */
function splitForTrend<T>(xs: T[]): [T[], T[]] {
  if (xs.length < 2) return [xs, []];
  const latestCount = xs.length >= 3 ? 2 : 1;
  return [xs.slice(0, latestCount), xs.slice(latestCount)];
}

/**
 * @param samples evaluated exams, newest first (only the first PROFILE_WINDOW are used)
 * @param testsTaken all-time count of evaluated exams with usable speech
 */
export function computeProfileStats(samples: ProfileSample[], testsTaken = samples.length): LearningProfileStats {
  const window = samples.slice(0, PROFILE_WINDOW).map((s) => s.candidate);
  const targetLevel: CefrLevel = window[0]?.targetLevel ?? 'B1';

  const criterionAverages = {} as Record<CriterionKey, number>;
  const criterionTrend = {} as Record<CriterionKey, Trend>;
  const [latest, earlier] = splitForTrend(window);

  for (const key of CRITERION_KEYS) {
    criterionAverages[key] = round1(mean(window.map((c) => c.criteriaScores[key].score)));
    criterionTrend[key] = earlier.length
      ? trendOf(mean(latest.map((c) => c.criteriaScores[key].score)), mean(earlier.map((c) => c.criteriaScores[key].score)))
      : 'flat';
  }

  const recentAvg = round1(mean(CRITERION_KEYS.map((k) => criterionAverages[k])));
  const overallTrend = earlier.length
    ? trendOf(mean(latest.map(candidateAverage)), mean(earlier.map(candidateAverage)))
    : 'flat';

  // Most frequent assessed level; iterating newest first means ties keep the most recent.
  const counts = new Map<AssessedLevel, number>();
  let currentLevel: AssessedLevel = window[0]?.assessedLevel ?? 'Under B1';
  for (const c of window) {
    const n = (counts.get(c.assessedLevel) ?? 0) + 1;
    counts.set(c.assessedLevel, n);
    if (n > (counts.get(currentLevel) ?? 0)) currentLevel = c.assessedLevel;
  }

  const passRate = window.length ? window.filter((c) => c.passedTargetLevel).length / window.length : 0;
  const readinessPct = Math.min(100, Math.round((recentAvg / PASS_MARK[targetLevel]) * 100));

  return {
    sampleSize: window.length,
    testsTaken: Math.max(testsTaken, window.length),
    targetLevel,
    recentAvg,
    criterionAverages,
    criterionTrend,
    overallTrend,
    currentLevel,
    passRate: Math.round(passRate * 100) / 100,
    readinessPct,
  };
}

/** Criteria sorted weakest first; declining trend breaks ties. */
export function rankWeakestCriteria(stats: LearningProfileStats): CriterionKey[] {
  const trendWeight: Record<Trend, number> = { down: 0, flat: 1, up: 2 };
  return [...CRITERION_KEYS].sort(
    (a, b) =>
      stats.criterionAverages[a] - stats.criterionAverages[b] ||
      trendWeight[stats.criterionTrend[a]] - trendWeight[stats.criterionTrend[b]]
  );
}

const MISTAKE_PATTERNS: { pattern: string; match: RegExp }[] = [
  { pattern: 'V2-regelen / inversjon (verb second)', match: /v2|inversj|invers/i },
  { pattern: 'Leddsetninger og plassering av «ikke» (subordinate clauses)', match: /leddsetn|subordinat|ikke-plass|adverb/i },
  { pattern: 'Substantivkjønn og samsvar (noun gender & agreement)', match: /kjønn|gender|samsvar|agreement|artikkel|article/i },
  { pattern: 'Verbtider (verb tense)', match: /tid\b|tense|preteritum|perfektum|presens|fortid/i },
  { pattern: 'Preposisjoner (prepositions)', match: /preposisj|preposition/i },
  { pattern: 'Bestemt / ubestemt form (definite vs. indefinite)', match: /bestemt|definite/i },
  { pattern: 'Ordvalg og idiomer (word choice & idioms)', match: /ordvalg|idiom|vocab|ordforråd|word choice|uttrykk/i },
];

/** Group the concrete corrections of the window into recurring patterns, most frequent first. */
export function groupRecurringMistakes(samples: ProfileSample[], limit = 3): CoachMistake[] {
  const groups = new Map<string, { count: number; example: CoachMistake }>();
  for (const s of samples.slice(0, PROFILE_WINDOW)) {
    for (const corr of s.candidate.concreteCorrections ?? []) {
      const known = MISTAKE_PATTERNS.find((p) => p.match.test(corr.grammarOrVocabRule));
      const pattern = known?.pattern ?? corr.grammarOrVocabRule.split(/[.;:\n]/)[0].trim().slice(0, 80);
      if (!pattern) continue;
      const existing = groups.get(pattern);
      if (existing) existing.count += 1;
      // Newest sample comes first, so the first example seen is the most recent one.
      else groups.set(pattern, { count: 1, example: { pattern, example: corr.originalQuote, fix: corr.correctedNorwegian } });
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((g) => g.example);
}

const OFFLINE_ADVICE: Record<CriterionKey, { no: string; en: string }> = {
  formidlingOgFlyt: {
    no: 'Øv på å snakke sammenhengende i 1–2 minutter om hverdagstemaer. Bruk bindeord som «først», «derfor», «på den andre siden» og «til slutt» for å binde sammen argumentene.',
    en: 'Practise speaking continuously for 1–2 minutes on everyday topics. Use linking words like «først», «derfor», «på den andre siden» and «til slutt» to connect your points.',
  },
  uttaleOgForstaelighet: {
    no: 'Lytt til norsk radio eller podkast og gjenta setninger høyt (skyggelesing). Fokuser på trykk og setningsmelodi, og ta opp deg selv for å sammenligne.',
    en: 'Listen to Norwegian radio or podcasts and repeat sentences aloud (shadowing). Focus on stress and sentence melody, and record yourself to compare.',
  },
  ordforrad: {
    no: 'Lag en ordliste per eksamenstema (helse, jobb, familie, miljø) med 10–15 nyttige uttrykk, og bruk dem bevisst i neste prøve i stedet for å gjenta de samme ordene.',
    en: 'Build a word list per exam theme (health, work, family, environment) with 10–15 useful expressions, and use them deliberately next time instead of repeating the same words.',
  },
  grammatikkOgSetningsstruktur: {
    no: 'Drill V2-regelen: når setningen starter med noe annet enn subjektet, kommer verbet på plass nummer to («I dag går jeg …»). Øv også på «ikke» før verbet i leddsetninger («… fordi jeg ikke har tid»).',
    en: 'Drill the V2 rule: when a sentence starts with something other than the subject, the verb comes second («I dag går jeg …»). Also practise «ikke» before the verb in subordinate clauses («… fordi jeg ikke har tid»).',
  },
};

const LEVEL_TEXT: Record<AssessedLevel, { no: string; en: string }> = {
  'Under B1': { no: 'under B1', en: 'below B1' },
  B1: { no: 'B1', en: 'B1' },
  B2: { no: 'B2', en: 'B2' },
  'Over B2': { no: 'over B2', en: 'above B2' },
};

/** Rule-based coach used when the LLM is unavailable or fails. */
export function buildOfflineCoach(stats: LearningProfileStats, samples: ProfileSample[]): LearningCoach {
  const ranked = rankWeakestCriteria(stats);
  const strongest = ranked[ranked.length - 1];
  const passMark = PASS_MARK[stats.targetLevel];
  const level = LEVEL_TEXT[stats.currentLevel];
  const meetsTarget = LEVEL_ORDER.indexOf(stats.currentLevel) >= LEVEL_ORDER.indexOf(stats.targetLevel);

  const trendNo = { up: 'Du er i fremgang', down: 'Resultatene har falt litt den siste tiden', flat: 'Resultatene dine er stabile' }[stats.overallTrend];
  const trendEn = { up: 'You are improving', down: 'Your results have dipped recently', flat: 'Your results are steady' }[stats.overallTrend];

  const statusNo = `${trendNo}. Over de siste ${stats.sampleSize} prøvene ligger du på ${level.no} med et snitt på ${stats.recentAvg}/10 (${meetsTarget ? 'du når' : 'du er ikke helt på'} målnivå ${stats.targetLevel}, som krever rundt ${passMark}). Det som gir mest effekt nå er ${CRITERION_TITLES[ranked[0]].no.toLowerCase()}.`;
  const statusEn = `${trendEn}. Across your last ${stats.sampleSize} tests you are at ${level.en} with an average of ${stats.recentAvg}/10 (${meetsTarget ? 'you are meeting' : 'you are not yet at'} target level ${stats.targetLevel}, which needs about ${passMark}). The biggest gain right now is ${CRITERION_TITLES[ranked[0]].en.toLowerCase()}.`;

  const focusAreas: CoachFocusArea[] = ranked
    .filter((k) => stats.criterionAverages[k] < 10)
    .slice(0, 2)
    .map((k) => ({
      criterion: k,
      titleNo: CRITERION_TITLES[k].no,
      titleEn: CRITERION_TITLES[k].en,
      adviceNo: OFFLINE_ADVICE[k].no,
      adviceEn: OFFLINE_ADVICE[k].en,
    }));

  const strengths = [
    {
      no: `${CRITERION_TITLES[strongest].no} er din sterkeste side (${stats.criterionAverages[strongest]}/10).`,
      en: `${CRITERION_TITLES[strongest].en} is your strongest area (${stats.criterionAverages[strongest]}/10).`,
    },
  ];
  const improving = CRITERION_KEYS.filter((k) => stats.criterionTrend[k] === 'up' && k !== strongest);
  if (improving.length) {
    strengths.push({
      no: `Du har forbedret deg i ${improving.map((k) => CRITERION_TITLES[k].no.toLowerCase()).join(' og ')}.`,
      en: `You have improved in ${improving.map((k) => CRITERION_TITLES[k].en.toLowerCase()).join(' and ')}.`,
    });
  }

  const recurringMistakes = groupRecurringMistakes(samples);
  const first = recurringMistakes[0];

  return {
    statusNo,
    statusEn,
    strengths,
    focusAreas,
    recurringMistakes,
    nextStepNo: first
      ? `I neste prøve: pass spesielt på «${first.pattern}». Du sa «${first.example}» – prøv heller «${first.fix}».`
      : `I neste prøve: fokuser på ${CRITERION_TITLES[ranked[0]].no.toLowerCase()} og snakk litt lenger i hvert svar.`,
    nextStepEn: first
      ? `Next test: watch out for «${first.pattern}». You said «${first.example}» – try «${first.fix}» instead.`
      : `Next test: focus on ${CRITERION_TITLES[ranked[0]].en.toLowerCase()} and give slightly longer answers.`,
  };
}

/** Minimal session shape needed to build a history row */
export interface HistorySessionInput {
  id: string;
  level: CefrLevel;
  coCandidateMode: ExamHistoryItem['coCandidateMode'];
  startedAt: Date | string;
  completedAt: Date | string | null;
  evaluationJson: ExamEvaluation | null;
  title: string | null;
  themeTitleNo: string | null;
}

const iso = (d: Date | string | null) => (d == null ? null : new Date(d).toISOString());

export function toHistoryItem(s: HistorySessionInput): ExamHistoryItem {
  const candidate = pickUserCandidate(s.evaluationJson);
  return {
    sessionId: s.id,
    startedAt: iso(s.startedAt)!,
    completedAt: iso(s.completedAt),
    level: s.level,
    coCandidateMode: s.coCandidateMode,
    title: s.title,
    themeTitleNo: s.themeTitleNo,
    pending: !s.evaluationJson,
    insufficientData: !!s.evaluationJson?.insufficientData,
    assessedLevel: candidate?.assessedLevel ?? null,
    passed: candidate ? candidate.passedTargetLevel : null,
    avgScore: candidate ? candidateAverage(candidate) : null,
    criteriaScores: candidate
      ? (Object.fromEntries(CRITERION_KEYS.map((k) => [k, candidate.criteriaScores[k].score])) as Record<CriterionKey, number>)
      : null,
    summaryNo: candidate?.overallSummaryNo ?? null,
    summaryEn: candidate?.overallSummaryEn ?? null,
  };
}
