/**
 * Client-side presentation helpers for the learning profile, shared by
 * LearningProfileScreen and the progress widget on ExamSetupScreen.
 */
import type { AssessedLevel } from '../types/exam';
import type { Trend } from '../types/learning-profile';
import type { BadgeTone, IconName } from '../components/ui';
import { colors } from '../theme';

export const LEVEL_TONE: Record<AssessedLevel, BadgeTone> = {
  'Under B1': 'warning',
  B1: 'navy',
  B2: 'success',
  'Over B2': 'gold',
};

export const TREND_ICON: Record<Trend, { name: IconName; color: string }> = {
  up: { name: 'trending-up', color: colors.success },
  down: { name: 'trending-down', color: colors.danger },
  flat: { name: 'remove', color: colors.textMuted },
};

export const TREND_LABEL_KEY = {
  up: 'profile.trendUp',
  down: 'profile.trendDown',
  flat: 'profile.trendFlat',
} as const satisfies Record<Trend, string>;
