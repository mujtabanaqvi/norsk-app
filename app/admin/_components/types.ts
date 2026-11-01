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

export type Tier = 'FREE' | 'STANDARD' | 'PREMIUM';
export type PaymentProvider = 'STRIPE' | 'APPLE' | 'GOOGLE' | 'PROMO';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  emailVerified: boolean;
  role: 'USER' | 'ADMIN';
  subscriptionTier: Tier;
  deactivatedAt: string | null;
  createdAt: string;
  /** Provider of the subscription currently granting the tier (null on FREE) */
  activeProvider: PaymentProvider | null;
  examCount: number;
  lastExamAt: string | null;
}

export interface AdminUserDetail {
  user: Omit<AdminUser, 'activeProvider' | 'examCount' | 'lastExamAt'> & { referralCode: string };
  signInMethods: string[];
  subscriptions: Array<{
    id: string;
    provider: PaymentProvider;
    productId: string | null;
    tier: Tier;
    status: 'INACTIVE' | 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED';
    environment: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  }>;
  /** Auto-renewing store subscription: deleting the user does not stop the billing */
  hasActivePaidSubscription: boolean;
  usage: {
    remainingAudioSeconds: number;
    totalSttSecondsUsed: number;
    totalLlmTokensUsed: number;
    totalCostUsd: number;
  } | null;
  exams: Partial<Record<'ACTIVE' | 'COMPLETED' | 'FAILED', number>>;
  referralCount: number;
  referredBy: { id: string; name: string; email: string } | null;
  promoRedemptions: Array<{ code: string; tier: Tier; redeemedAt: string }>;
}

export type AdminRequest =(url: string, method: string, body?: unknown) => Promise<any>;

/** Filters the exam list can be opened with from other sections (e.g. clicking a theme's set count). */
export interface ExamFilterPreset {
  themeId?: string;
  level?: 'ALL' | Level;
}
