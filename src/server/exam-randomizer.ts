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

