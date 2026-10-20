/**
 * Learning profile: a rolling view of the user's last few evaluated exams plus a
 * coach summary of what to improve. Shared by the API (persisted in learning_profiles)
 * and the client (LearningProfileScreen).
 */
import type { AssessedLevel, CefrLevel, CoCandidateMode } from './exam';

export const CRITERION_KEYS = [
  'formidlingOgFlyt',
  'uttaleOgForstaelighet',
  'ordforrad',
  'grammatikkOgSetningsstruktur',
] as const;

export type CriterionKey = (typeof CRITERION_KEYS)[number];

export type Trend = 'up' | 'down' | 'flat';

export interface LearningProfileStats {
  /** Number of evaluated exams the stats are based on (max PROFILE_WINDOW) */
  sampleSize: number;
  /** All-time evaluated exams with usable speech */
  testsTaken: number;
  /** Target level of the most recent exam */
  targetLevel: CefrLevel;
  /** Mean of all four criteria over the window, one decimal */
  recentAvg: number;
  criterionAverages: Record<CriterionKey, number>;
  /** Latest 2 exams vs the earlier ones in the window */
  criterionTrend: Record<CriterionKey, Trend>;
  overallTrend: Trend;
  /** Most frequent assessed level in the window; ties go to the most recent */
  currentLevel: AssessedLevel;
  /** Share of exams in the window that met the target level (0–1) */
  passRate: number;
  /** How close the recent average is to the pass mark for the target level (0–100) */
  readinessPct: number;
}

export interface CoachFocusArea {
  criterion: CriterionKey;
  titleNo: string;
  titleEn: string;
  adviceNo: string;
  adviceEn: string;
}

export interface CoachMistake {
  /** Short name of the recurring error pattern, e.g. "V2-regelen / inversion" */
  pattern: string;
  /** What the user actually said */
  example: string;
  /** Corrected Norwegian */
  fix: string;
}

export interface LearningCoach {
  statusNo: string;
  statusEn: string;
  strengths: { no: string; en: string }[];
  focusAreas: CoachFocusArea[];
  recurringMistakes: CoachMistake[];
  nextStepNo: string;
  nextStepEn: string;
}

export interface LearningInsight {
  stats: LearningProfileStats;
  coach: LearningCoach;
  generatedBy: 'llm' | 'offline';
  generatedAt: string;
}

/** One row of the test history list */
export interface ExamHistoryItem {
  sessionId: string;
  startedAt: string;
  completedAt: string | null;
  level: CefrLevel;
  coCandidateMode: CoCandidateMode;
  title: string | null;
  themeTitleNo: string | null;
  /** Evaluation not written yet */
  pending: boolean;
  insufficientData: boolean;
  assessedLevel: AssessedLevel | null;
  passed: boolean | null;
  avgScore: number | null;
  criteriaScores: Record<CriterionKey, number> | null;
  summaryNo: string | null;
  summaryEn: string | null;
}

/** GET /api/profile response payload */
export interface LearningProfileResponse {
  insight: LearningInsight | null;
  /** Session ids the insight was computed from */
  basedOnSessionIds: string[];
  updatedAt: string | null;
  history: ExamHistoryItem[];
}
