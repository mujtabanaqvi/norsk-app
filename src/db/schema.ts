import {
  pgTable,
  uuid,
  varchar,
  integer,
  bigint,
  numeric,
  text,
  boolean,
  jsonb,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import type { LearningInsight } from '../types/learning-profile';

// Enums
export const cefrLevelEnum = pgEnum('cefr_level', ['B1', 'B2']);
export const examLevelEnum = cefrLevelEnum; // backward-compatibility alias
export const coCandidateModeEnum = pgEnum('co_candidate_mode', ['AI_PEER', 'HUMAN_LOCAL']);
export const sessionStatusEnum = pgEnum('session_status', ['ACTIVE', 'COMPLETED', 'FAILED']);
export const usageSourceEnum = pgEnum('usage_source', [
  'REALTIME_VOICE_AGENT',
  'POST_EXAM_RUBRIC_EVAL',
]);

export const userRoleEnum = pgEnum('user_role', ['USER', 'ADMIN']);
export const subscriptionTierEnum = pgEnum('subscription_tier', ['FREE', 'STANDARD', 'PREMIUM']);
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'INACTIVE',
  'ACTIVE',
  'TRIALING',
  'PAST_DUE',
  'CANCELED',
]);
// PROMO = free access granted by redeeming a promo code (no store involved)
export const paymentProviderEnum = pgEnum('payment_provider', ['STRIPE', 'APPLE', 'GOOGLE', 'PROMO']);

// Transcript structure stored in JSONB
export interface TranscriptEntry {
  speaker: string;
  role: 'EXAMINER' | 'AI_COCANDIDATE' | 'CANDIDATE_1' | 'CANDIDATE_2';
  text: string;
  timestamp: number;
  /** Exam part the utterance belongs to (DEL_1 | DEL_2 | DEL_3) */
  stage?: string;
  /** Recorded speaking duration for candidate utterances (ms) */
  durationMs?: number;
}

// Turn-based exam engine state + accumulated usage, persisted per session
export interface SessionEngineState {
  engine: {
    stage: 'DEL1_MONOLOGUE' | 'DEL2_AI' | 'DEL2_HUMAN' | 'DEL3' | 'DONE';
    del1Nudges: number;
    del2Exchanges: number;
    del2StartedAt?: number;
    followUpIndex: number;
  };
  /** Randomly selected Del 3 follow-up questions for this specific session */
  selectedFollowUpQuestionsNo?: string[];
  /** Snapshot of the exam composed for this session (Del 1/Del 2 may come from different sets/themes) */
  selectedPrompts?: SelectedExamPrompts;
  usage: {
    llmPromptTokens: number;
    llmCompletionTokens: number;
    ttsCharacters: number;
    sttAudioSeconds: number;
  };
}

// Prompts composed for a session from one or more question sets
export interface SelectedExamPrompts {
  titleNo: string;
  monologuePromptNo: string;
  discussionPromptNo: string;
  monologueTopicId: string;
  discussionTopicId: string;
  followUpThemeIds: string[];
}

// Criterion Score structure
export interface CriterionScore {
  score: number; // 1-10
  feedbackNo: string;
  feedbackEn: string;
}

// Concrete improvement correction
export interface ConcreteCorrection {
  originalQuote: string;
  correctedNorwegian: string;
  grammarOrVocabRule: string;
}

// Candidate evaluation scorecard
export interface CandidateEvaluation {
  speakerRole: 'CANDIDATE_1' | 'CANDIDATE_2';
  targetLevel: 'B1' | 'B2';
  assessedLevel: 'Under B1' | 'B1' | 'B2' | 'Over B2';
  passedTargetLevel: boolean;
  overallSummaryNo: string;
  overallSummaryEn: string;
  criteriaScores: {
    formidlingOgFlyt: CriterionScore;
    uttaleOgForstaelighet: CriterionScore;
    ordforrad: CriterionScore;
    grammatikkOgSetningsstruktur: CriterionScore;
  };
  concreteCorrections: ConcreteCorrection[];
}

// Complete post-exam evaluation stored in JSONB
export interface ExamEvaluation {
  candidates: CandidateEvaluation[];
  evaluatedAt?: string;
  insufficientData?: boolean;
  notes?: string;
}

/**
 * 0. exam_themes Table (categories grouping many question sets, e.g. "Familie og barn")
 */
export const examThemes = pgTable('exam_themes', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  titleNo: text('title_no').notNull(),
  descriptionNo: text('description_no'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 1. exam_topics Table (a question set: Del 1 monologue, Del 2 discussion, Del 3 follow-up pool)
 */
export const examTopics = pgTable(
  'exam_topics',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    themeId: uuid('theme_id').references(() => examThemes.id, { onDelete: 'set null' }),
    titleNo: text('title_no').notNull(),
    level: cefrLevelEnum('level').notNull(),
    monologuePromptNo: text('monologue_prompt_no').notNull(),
    discussionPromptNo: text('discussion_prompt_no').notNull(),
    followUpQuestionsNo: jsonb('follow_up_questions_no').$type<string[]>().notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_exam_topics_theme_id').on(table.themeId)]
);

/**
 * 2. user_quotas Table
 */
export const userQuotas = pgTable('user_quotas', {
  userId: varchar('user_id', { length: 128 }).primaryKey(),
  remainingAudioSeconds: integer('remaining_audio_seconds').notNull().default(1800),
  totalLlmTokensUsed: bigint('total_llm_tokens_used', { mode: 'number' })
    .notNull()
    .default(0),
  totalTtsCharactersUsed: bigint('total_tts_characters_used', { mode: 'number' })
    .notNull()
    .default(0),
  totalSttSecondsUsed: numeric('total_stt_seconds_used', { precision: 10, scale: 2 })
    .notNull()
    .default('0'),
  totalCostUsd: numeric('total_cost_usd', { precision: 10, scale: 6 })
    .notNull()
    .default('0'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 3. exam_sessions Table
 */
export const examSessions = pgTable(
  'exam_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: varchar('user_id', { length: 128 }).notNull(),
    topicId: uuid('topic_id').references(() => examTopics.id),
    /** Theme chosen by the user; null when the exam was composed randomly across themes */
    themeId: uuid('theme_id').references(() => examThemes.id, { onDelete: 'set null' }),
    level: cefrLevelEnum('level').notNull(),
    coCandidateMode: coCandidateModeEnum('co_candidate_mode').notNull(),
    status: sessionStatusEnum('status').notNull().default('ACTIVE'),
    transcriptJson: jsonb('transcript_json').$type<TranscriptEntry[]>(),
    evaluationJson: jsonb('evaluation_json').$type<ExamEvaluation>(),
    engineState: jsonb('engine_state').$type<SessionEngineState>(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_exam_sessions_user_id').on(table.userId),
    index('idx_exam_sessions_status').on(table.status),
    index('idx_exam_sessions_topic_id').on(table.topicId),
    index('idx_exam_sessions_theme_id').on(table.themeId),
  ]
);

/**
 * 3b. learning_profiles Table (rolling summary of the user's latest evaluated exams)
 */
export const learningProfiles = pgTable('learning_profiles', {
  userId: varchar('user_id', { length: 128 }).primaryKey(),
  insightJson: jsonb('insight_json').$type<LearningInsight>().notNull(),
  basedOnSessionIds: jsonb('based_on_session_ids').$type<string[]>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 4. usage_ledger Table
 */
export const usageLedger = pgTable(
  'usage_ledger',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => examSessions.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 128 }).notNull(),
    source: usageSourceEnum('source').notNull(),
    llmModel: varchar('llm_model', { length: 64 }).notNull(),
    llmPromptTokens: integer('llm_prompt_tokens').notNull().default(0),
    llmCompletionTokens: integer('llm_completion_tokens').notNull().default(0),
    ttsCharacters: integer('tts_characters').notNull().default(0),
    sttAudioSeconds: numeric('stt_audio_seconds', { precision: 10, scale: 2 })
      .notNull()
      .default('0'),
    estimatedCostUsd: numeric('estimated_cost_usd', { precision: 10, scale: 6 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_usage_ledger_session_id').on(table.sessionId),
    index('idx_usage_ledger_user_id').on(table.userId),
  ]
);

/**
 * 5. Better Auth Core Tables: user, session, account, verification
 */
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  // App-specific user attributes
  role: userRoleEnum('role').notNull().default('USER'),
  subscriptionTier: subscriptionTierEnum('subscription_tier').notNull().default('FREE'),
  referralCode: varchar('referral_code', { length: 32 }).notNull().unique(),
  referredByUserId: varchar('referred_by_user_id', { length: 128 }),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (table) => [
  index('idx_session_user_id').on(table.userId),
]);

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_account_user_id').on(table.userId),
  index('idx_account_provider').on(table.providerId, table.accountId),
]);

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Backward-compatible alias for app queries
export const users = user;
export const oauthAccounts = account;

/**
 * 7. subscriptions Table
 */
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: varchar('user_id', { length: 128 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Store the subscription was bought in (STRIPE = RevenueCat Web Billing); all of them are synced from RevenueCat
  provider: paymentProviderEnum('provider').notNull().default('STRIPE'),
  // `rc:<userId>:<productId>`, one row per RevenueCat subscription; `promo:<promoCodeId>:<userId>` for promo grants
  externalId: varchar('external_id', { length: 512 }).notNull(),
  productId: varchar('product_id', { length: 255 }),
  environment: varchar('environment', { length: 16 }).notNull().default('production'),
  tier: subscriptionTierEnum('tier').notNull(),
  status: subscriptionStatusEnum('status').notNull().default('ACTIVE'),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_subscriptions_provider_external').on(table.provider, table.externalId),
  index('idx_subscriptions_user_id').on(table.userId),
]);

/**
 * 8. tier_configs Table (Configurable limits and pricing)
 */
export const tierConfigs = pgTable('tier_configs', {
  tier: subscriptionTierEnum('tier').primaryKey(),
  dailyTestLimit: integer('daily_test_limit').notNull(),
  priceCents: integer('price_cents').notNull().default(0), // in NOK øre or EUR cents
  currency: varchar('currency', { length: 3 }).notNull().default('NOK'),
  featuresJson: jsonb('features_json').$type<string[]>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 9. referral_rewards Table
 */
export const referralRewards = pgTable(
  'referral_rewards',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    referrerUserId: varchar('referrer_user_id', { length: 128 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    referredUserId: varchar('referred_user_id', { length: 128 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bonusTestsPerDay: integer('bonus_tests_per_day').notNull().default(1),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_referral_rewards_referrer').on(table.referrerUserId),
    index('idx_referral_rewards_expires').on(table.expiresAt),
  ]
);

/**
 * 10. system_configs Table
 */
export const systemConfigs = pgTable('system_configs', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: text('value').notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 11. promo_codes Table (Admin-created codes that grant a paid tier for a number of months)
 */
export const promoCodes = pgTable('promo_codes', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 32 }).notNull().unique(), // stored uppercase
  tier: subscriptionTierEnum('tier').notNull(),
  // Only 100 is redeemable today; partial discounts will need a store-side offer
  discountPercent: integer('discount_percent').notNull().default(100),
  durationMonths: integer('duration_months').notNull(),
  maxRedemptions: integer('max_redemptions'), // null = unlimited
  redemptionCount: integer('redemption_count').notNull().default(0),
  validFrom: timestamp('valid_from', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 12. promo_redemptions Table (One row per user per redeemed code)
 */
export const promoRedemptions = pgTable(
  'promo_redemptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    promoCodeId: uuid('promo_code_id')
      .notNull()
      .references(() => promoCodes.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 128 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_promo_redemptions_code_user').on(table.promoCodeId, table.userId),
    index('idx_promo_redemptions_user_id').on(table.userId),
  ]
);

// Drizzle Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  oauthAccounts: many(oauthAccounts),
  subscriptions: many(subscriptions),
  sessions: many(examSessions),
  earnedRewards: many(referralRewards, { relationName: 'referrer' }),
  referredRewards: many(referralRewards, { relationName: 'referred' }),
  promoRedemptions: many(promoRedemptions),
  referredBy: one(users, {
    fields: [users.referredByUserId],
    references: [users.id],
    relationName: 'userReferrals',
  }),
}));

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, {
    fields: [oauthAccounts.userId],
    references: [users.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
}));

export const referralRewardsRelations = relations(referralRewards, ({ one }) => ({
  referrer: one(users, {
    fields: [referralRewards.referrerUserId],
    references: [users.id],
    relationName: 'referrer',
  }),
  referred: one(users, {
    fields: [referralRewards.referredUserId],
    references: [users.id],
    relationName: 'referred',
  }),
}));

export const promoCodesRelations = relations(promoCodes, ({ many }) => ({
  redemptions: many(promoRedemptions),
}));

export const promoRedemptionsRelations = relations(promoRedemptions, ({ one }) => ({
  promoCode: one(promoCodes, {
    fields: [promoRedemptions.promoCodeId],
    references: [promoCodes.id],
  }),
  user: one(users, {
    fields: [promoRedemptions.userId],
    references: [users.id],
  }),
  subscription: one(subscriptions, {
    fields: [promoRedemptions.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export const examThemesRelations = relations(examThemes, ({ many }) => ({
  topics: many(examTopics),
  sessions: many(examSessions),
}));

export const examTopicsRelations = relations(examTopics, ({ one, many }) => ({
  theme: one(examThemes, {
    fields: [examTopics.themeId],
    references: [examThemes.id],
  }),
  sessions: many(examSessions),
}));

export const userQuotasRelations = relations(userQuotas, ({ many }) => ({
  sessions: many(examSessions),
  ledgerEntries: many(usageLedger),
}));

export const examSessionsRelations = relations(examSessions, ({ one, many }) => ({
  topic: one(examTopics, {
    fields: [examSessions.topicId],
    references: [examTopics.id],
  }),
  theme: one(examThemes, {
    fields: [examSessions.themeId],
    references: [examThemes.id],
  }),
  userQuota: one(userQuotas, {
    fields: [examSessions.userId],
    references: [userQuotas.userId],
  }),
  user: one(users, {
    fields: [examSessions.userId],
    references: [users.id],
  }),
  ledgerEntries: many(usageLedger),
}));

export const usageLedgerRelations = relations(usageLedger, ({ one }) => ({
  session: one(examSessions, {
    fields: [usageLedger.sessionId],
    references: [examSessions.id],
  }),
  userQuota: one(userQuotas, {
    fields: [usageLedger.userId],
    references: [userQuotas.userId],
  }),
}));

// Infer Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type OAuthAccount = typeof oauthAccounts.$inferSelect;
export type NewOAuthAccount = typeof oauthAccounts.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type TierConfig = typeof tierConfigs.$inferSelect;
export type NewTierConfig = typeof tierConfigs.$inferInsert;

export type ReferralReward = typeof referralRewards.$inferSelect;
export type NewReferralReward = typeof referralRewards.$inferInsert;

export type SystemConfig = typeof systemConfigs.$inferSelect;
export type NewSystemConfig = typeof systemConfigs.$inferInsert;

export type ExamTheme = typeof examThemes.$inferSelect;
export type NewExamTheme = typeof examThemes.$inferInsert;

export type ExamTopic = typeof examTopics.$inferSelect;
export type NewExamTopic = typeof examTopics.$inferInsert;

export type UserQuota = typeof userQuotas.$inferSelect;
export type NewUserQuota = typeof userQuotas.$inferInsert;

export type ExamSession = typeof examSessions.$inferSelect;
export type NewExamSession = typeof examSessions.$inferInsert;

export type LearningProfile = typeof learningProfiles.$inferSelect;
export type NewLearningProfile = typeof learningProfiles.$inferInsert;

export type UsageLedgerEntry = typeof usageLedger.$inferSelect;
export type NewUsageLedgerEntry = typeof usageLedger.$inferInsert;

export type PromoCode = typeof promoCodes.$inferSelect;
export type NewPromoCode = typeof promoCodes.$inferInsert;

export type PromoRedemption = typeof promoRedemptions.$inferSelect;
export type NewPromoRedemption = typeof promoRedemptions.$inferInsert;
