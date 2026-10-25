export type Level = 'B1' | 'B2';

export interface AdminExamTopic {
  id: string;
  slug: string;
  titleNo: string;
  level: Level;
  themeId: string | null;
  themeTitleNo?: string | null;
  monologuePromptNo: string;
  discussionPromptNo: string;
  followUpQuestionsNo: string[];
  isActive: boolean;
  createdAt: string;
  sessionCount?: number;
}

export interface AdminExamTheme {
  id: string;
  slug: string;
  titleNo: string;
  descriptionNo: string | null;
  sortOrder: number;
  isActive: boolean;
  setCounts: { B1: number; B2: number };
}

export interface AdminPromoCode {
  id: string;
  code: string;
  tier: 'STANDARD' | 'PREMIUM';
  discountPercent: number;
  durationMonths: number;
  maxRedemptions: number | null;
  redemptionCount: number;
  validFrom: string | null;
  expiresAt: string | null;
  isActive: boolean;
  note: string | null;
  createdAt: string;
}

export type AdminRequest = (url: string, method: string, body?: unknown) => Promise<any>;

/** Filters the exam list can be opened with from other sections (e.g. clicking a theme's set count). */
export interface ExamFilterPreset {
  themeId?: string;
  level?: 'ALL' | Level;
}
