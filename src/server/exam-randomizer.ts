import { randomInt } from 'crypto';

export const DEFAULT_FOLLOW_UP_QUESTION_COUNT = 3;

/**
 * Picks a single exam topic uniformly at random from a list of candidate topics.
 */
export function pickRandomExamTopic<T>(topics: readonly T[]): T | null {
  if (!Array.isArray(topics) || topics.length === 0) {
    return null;
  }
  if (topics.length === 1) {
    return topics[0];
  }
  const index = randomInt(0, topics.length);
  return topics[index];
}

/**
 * Shuffles an exam's follow-up question pool using Fisher-Yates and returns
 * up to `maxCount` questions (default: 3) for the candidate's session.
 */
export function pickRandomFollowUpQuestions(
  questions: readonly string[] | null | undefined,
  maxCount: number = DEFAULT_FOLLOW_UP_QUESTION_COUNT
): string[] {
  if (!Array.isArray(questions)) {
    return [];
  }

  const cleaned = questions
    .map((q) => (typeof q === 'string' ? q.trim() : ''))
    .filter((q) => q.length > 0);

  if (cleaned.length <= maxCount) {
    // Still shuffle order when there are > 1 questions so order varies per attempt
    const copy = [...cleaned];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = randomInt(0, i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  const shuffled = [...cleaned];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, Math.max(1, maxCount));
}

function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Minimal shape of a question set needed to compose an exam */
export interface ComposableQuestionSet {
  id: string;
  themeId: string | null;
  followUpQuestionsNo: string[] | null;
}

export interface ComposedExam<T extends ComposableQuestionSet> {
  /** Set providing the Del 1 monologue prompt */
  monologueSet: T;
  /** Set providing the Del 2 discussion prompt */
  discussionSet: T;
  /** Del 3 follow-up questions drawn for this session */
  followUpQuestionsNo: string[];
  /** Theme(s) the follow-up questions were drawn from */
  followUpThemeIds: string[];
}

/** Picks a random set, preferring one not already used when alternatives exist. */
function pickPreferringUnused<T extends ComposableQuestionSet>(
  sets: readonly T[],
  used: ReadonlySet<string>
): T | null {
  const unused = sets.filter((s) => !used.has(s.id));
  return pickRandomExamTopic(unused.length > 0 ? unused : sets);
}

function themeKey(set: ComposableQuestionSet): string {
  return set.themeId ?? '';
}

/**
 * Composes an exam from a pool of active question sets for one level.
 *
 * - With `themeId`: Del 1, Del 2 and Del 3 all come from sets in that theme;
 *   Del 3 follow-ups are pooled across every set in the theme.
 * - Without `themeId` (random): like the real Norskprøven, each part is drawn
 *   from a different random theme (themes are reused when fewer than 3 exist).
 */
export function composeExam<T extends ComposableQuestionSet>(
  sets: readonly T[],
  options: { themeId?: string | null; followUpCount?: number } = {}
): ComposedExam<T> | null {
  const followUpCount = options.followUpCount ?? DEFAULT_FOLLOW_UP_QUESTION_COUNT;
  if (!Array.isArray(sets) || sets.length === 0) {
    return null;
  }

  if (options.themeId) {
    const themeSets = sets.filter((s) => s.themeId === options.themeId);
    const monologueSet = pickRandomExamTopic(themeSets);
    if (!monologueSet) {
      return null;
    }
    const discussionSet =
      pickPreferringUnused(themeSets, new Set([monologueSet.id])) ?? monologueSet;
    const pooled = [...new Set(themeSets.flatMap((s) => s.followUpQuestionsNo ?? []))];
    return {
      monologueSet,
      discussionSet,
      followUpQuestionsNo: pickRandomFollowUpQuestions(pooled, followUpCount),
      followUpThemeIds: [options.themeId],
    };
  }

  const setsByTheme = new Map<string, T[]>();
  for (const set of sets) {
    const key = themeKey(set);
    setsByTheme.set(key, [...(setsByTheme.get(key) ?? []), set]);
  }
  const themeOrder = shuffle([...setsByTheme.keys()]);
  const setsForPart = (part: number) => setsByTheme.get(themeOrder[part % themeOrder.length])!;

  const used = new Set<string>();
  const monologueSet = pickPreferringUnused(setsForPart(0), used)!;
  used.add(monologueSet.id);
  const discussionSet = pickPreferringUnused(setsForPart(1), used)!;
  used.add(discussionSet.id);

  // Del 3: prefer follow-ups from sets not already used for Del 1/Del 2
  const followUpThemeSets = setsForPart(2);
  const unusedFollowUpSets = followUpThemeSets.filter((s) => !used.has(s.id));
  const followUpSource = unusedFollowUpSets.length > 0 ? unusedFollowUpSets : followUpThemeSets;
  const pooled = [...new Set(followUpSource.flatMap((s) => s.followUpQuestionsNo ?? []))];
  const followUpThemeId = themeOrder[2 % themeOrder.length];

  return {
    monologueSet,
    discussionSet,
    followUpQuestionsNo: pickRandomFollowUpQuestions(pooled, followUpCount),
    followUpThemeIds: followUpThemeId ? [followUpThemeId] : [],
  };
}

/**
 * Generates a URL-safe slug from a Norwegian exam title.
 */
export function slugifyNorwegianTitle(input: string): string {
  const normalized = input
    .toLowerCase()
    .trim()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 85);

  return normalized || `eksamen-${Date.now()}`;
}

