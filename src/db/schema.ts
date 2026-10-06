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
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const cefrLevelEnum = pgEnum('cefr_level', ['B1', 'B2']);
export const examLevelEnum = cefrLevelEnum; // backward-compatibility alias
export const coCandidateModeEnum = pgEnum('co_candidate_mode', ['AI_PEER', 'HUMAN_LOCAL']);
export const sessionStatusEnum = pgEnum('session_status', ['ACTIVE', 'COMPLETED', 'FAILED']);
export const usageSourceEnum = pgEnum('usage_source', [
  'REALTIME_VOICE_AGENT',
  'POST_EXAM_RUBRIC_EVAL',
]);

// Transcript structure stored in JSONB
export interface TranscriptEntry {
  speaker: string;
  role: 'EXAMINER' | 'AI_COCANDIDATE' | 'CANDIDATE_1' | 'CANDIDATE_2';
  text: string;
  timestamp: number;
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
 * 1. exam_topics Table
 */
export const examTopics = pgTable('exam_topics', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  titleNo: text('title_no').notNull(),
  level: cefrLevelEnum('level').notNull(),
  monologuePromptNo: text('monologue_prompt_no').notNull(),
  discussionPromptNo: text('discussion_prompt_no').notNull(),
  followUpQuestionsNo: jsonb('follow_up_questions_no').$type<string[]>().notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

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
    level: cefrLevelEnum('level').notNull(),
    coCandidateMode: coCandidateModeEnum('co_candidate_mode').notNull(),
    status: sessionStatusEnum('status').notNull().default('ACTIVE'),
    transcriptJson: jsonb('transcript_json').$type<TranscriptEntry[]>(),
    evaluationJson: jsonb('evaluation_json').$type<ExamEvaluation>(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_exam_sessions_user_id').on(table.userId),
    index('idx_exam_sessions_status').on(table.status),
    index('idx_exam_sessions_topic_id').on(table.topicId),
  ]
);

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

// Drizzle Relations
export const examTopicsRelations = relations(examTopics, ({ many }) => ({
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
  userQuota: one(userQuotas, {
    fields: [examSessions.userId],
    references: [userQuotas.userId],
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
export type ExamTopic = typeof examTopics.$inferSelect;
export type NewExamTopic = typeof examTopics.$inferInsert;

export type UserQuota = typeof userQuotas.$inferSelect;
export type NewUserQuota = typeof userQuotas.$inferInsert;

export type ExamSession = typeof examSessions.$inferSelect;
export type NewExamSession = typeof examSessions.$inferInsert;

export type UsageLedgerEntry = typeof usageLedger.$inferSelect;
export type NewUsageLedgerEntry = typeof usageLedger.$inferInsert;
