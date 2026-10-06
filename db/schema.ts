import {
  pgTable,
  uuid,
  varchar,
  integer,
  bigint,
  numeric,
  text,
  jsonb,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const examLevelEnum = pgEnum('exam_level', ['B1', 'B2']);
export const coCandidateModeEnum = pgEnum('co_candidate_mode', ['AI_PEER', 'HUMAN_LOCAL']);
export const sessionStatusEnum = pgEnum('session_status', ['ACTIVE', 'COMPLETED']);

// Transcript structure stored in JSONB
export interface TranscriptEntry {
  speaker: 'examiner' | 'co_candidate' | 'candidate' | string;
  role: 'examiner' | 'peer' | 'user' | string;
  text: string;
  timestamp: number;
}

// B1/B2 Oral Exam Evaluation structure stored in JSONB
export interface ExamEvaluationCriterion {
  score: number; // 1-5 or percentage
  levelAchieved: 'Under B1' | 'B1' | 'B2' | 'Over B2';
  feedback: string;
  evidence: string[];
}

export interface ExamEvaluation {
  overallLevel: 'Under B1' | 'B1' | 'B2' | 'Over B2';
  passedTargetLevel: boolean;
  summary: string;
  criteria: {
    uttale: ExamEvaluationCriterion; // Pronunciation
    flyt: ExamEvaluationCriterion; // Fluency
    ordforrad: ExamEvaluationCriterion; // Vocabulary
    grammatikk: ExamEvaluationCriterion; // Grammar
    sammenheng: ExamEvaluationCriterion; // Coherence & interaction
  };
  keyCorrections: Array<{
    candidateSaid: string;
    correction: string;
    explanation: string;
  }>;
  evaluatedAt: string;
}

/**
 * 1. user_quotas Table
 * Tracks remaining usage seconds and cumulative cost/token metrics per user
 */
export const userQuotas = pgTable('user_quotas', {
  userId: varchar('user_id', { length: 255 }).primaryKey(),
  remainingSeconds: integer('remaining_seconds').notNull().default(0),
  totalTokensUsed: bigint('total_tokens_used', { mode: 'number' }).notNull().default(0),
  totalCostUsd: numeric('total_cost_usd', { precision: 12, scale: 6 })
    .notNull()
    .default('0.000000'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * 2. exam_sessions Table
 * Records Norwegian oral exam practice sessions and final evaluations
 */
export const examSessions = pgTable(
  'exam_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: varchar('user_id', { length: 255 }).notNull(),
    level: examLevelEnum('level').notNull(),
    coCandidateMode: coCandidateModeEnum('co_candidate_mode').notNull(),
    topic: text('topic').notNull(),
    status: sessionStatusEnum('status').notNull().default('ACTIVE'),
    transcriptJson: jsonb('transcript_json').$type<TranscriptEntry[]>(),
    evaluationJson: jsonb('evaluation_json').$type<ExamEvaluation>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_exam_sessions_user_id').on(table.userId),
    index('idx_exam_sessions_status').on(table.status),
    index('idx_exam_sessions_created_at').on(table.createdAt),
  ]
);

/**
 * 3. usage_ledger Table
 * Immutable audit trail for every billing/agent consumption event
 */
export const usageLedger = pgTable(
  'usage_ledger',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => examSessions.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 255 }).notNull(),
    llmPromptTokens: integer('llm_prompt_tokens').notNull().default(0),
    llmCompletionTokens: integer('llm_completion_tokens').notNull().default(0),
    ttsCharacters: integer('tts_characters').notNull().default(0),
    sttAudioSeconds: numeric('stt_audio_seconds', { precision: 10, scale: 2 })
      .notNull()
      .default('0.00'),
    estimatedCostUsd: numeric('estimated_cost_usd', { precision: 12, scale: 6 })
      .notNull()
      .default('0.000000'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_usage_ledger_session_id').on(table.sessionId),
    index('idx_usage_ledger_user_id').on(table.userId),
  ]
);

// Drizzle Relations
export const userQuotasRelations = relations(userQuotas, ({ many }) => ({
  sessions: many(examSessions),
  ledgerEntries: many(usageLedger),
}));

export const examSessionsRelations = relations(examSessions, ({ one, many }) => ({
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
export type UserQuota = typeof userQuotas.$inferSelect;
export type NewUserQuota = typeof userQuotas.$inferInsert;

export type ExamSession = typeof examSessions.$inferSelect;
export type NewExamSession = typeof examSessions.$inferInsert;

export type UsageLedgerEntry = typeof usageLedger.$inferSelect;
export type NewUsageLedgerEntry = typeof usageLedger.$inferInsert;

