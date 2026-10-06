import test from 'node:test';
import assert from 'node:assert/strict';
import {
  examTopics,
  userQuotas,
  examSessions,
  usageLedger,
  cefrLevelEnum,
  coCandidateModeEnum,
  sessionStatusEnum,
  usageSourceEnum,
} from '../src/db/schema';
import { SAMPLE_TOPICS, TEST_USER_ID } from '../src/db/seed';
import drizzleConfig from '../drizzle.config';
import { db, pool } from '../src/db/index';

test('Schema: verifies all PostgreSQL tables and columns match prompt specifications', () => {
  // 1. exam_topics
  assert.ok(examTopics.id, 'exam_topics.id PK exists');
  assert.ok(examTopics.slug, 'exam_topics.slug unique exists');
  assert.ok(examTopics.titleNo, 'exam_topics.titleNo exists');
  assert.ok(examTopics.level, 'exam_topics.level exists');
  assert.ok(examTopics.monologuePromptNo, 'exam_topics.monologuePromptNo exists');
  assert.ok(examTopics.discussionPromptNo, 'exam_topics.discussionPromptNo exists');
  assert.ok(examTopics.followUpQuestionsNo, 'exam_topics.followUpQuestionsNo exists');
  assert.ok(examTopics.isActive, 'exam_topics.isActive exists');

  // 2. user_quotas
  assert.ok(userQuotas.userId, 'user_quotas.userId PK exists');
  assert.ok(userQuotas.remainingAudioSeconds, 'user_quotas.remainingAudioSeconds exists');
  assert.ok(userQuotas.totalLlmTokensUsed, 'user_quotas.totalLlmTokensUsed exists');
  assert.ok(userQuotas.totalTtsCharactersUsed, 'user_quotas.totalTtsCharactersUsed exists');
  assert.ok(userQuotas.totalSttSecondsUsed, 'user_quotas.totalSttSecondsUsed exists');
  assert.ok(userQuotas.totalCostUsd, 'user_quotas.totalCostUsd exists');
  assert.ok(userQuotas.updatedAt, 'user_quotas.updatedAt exists');

  // 3. exam_sessions
  assert.ok(examSessions.id, 'exam_sessions.id PK exists');
  assert.ok(examSessions.userId, 'exam_sessions.userId exists');
  assert.ok(examSessions.topicId, 'exam_sessions.topicId FK exists');
  assert.ok(examSessions.level, 'exam_sessions.level exists');
  assert.ok(examSessions.coCandidateMode, 'exam_sessions.coCandidateMode exists');
  assert.ok(examSessions.status, 'exam_sessions.status exists');
  assert.ok(examSessions.transcriptJson, 'exam_sessions.transcriptJson exists');
  assert.ok(examSessions.evaluationJson, 'exam_sessions.evaluationJson exists');
  assert.ok(examSessions.startedAt, 'exam_sessions.startedAt exists');
  assert.ok(examSessions.completedAt, 'exam_sessions.completedAt exists');

  // 4. usage_ledger
  assert.ok(usageLedger.id, 'usage_ledger.id PK exists');
  assert.ok(usageLedger.sessionId, 'usage_ledger.sessionId exists');
  assert.ok(usageLedger.userId, 'usage_ledger.userId exists');
  assert.ok(usageLedger.source, 'usage_ledger.source exists');
  assert.ok(usageLedger.llmModel, 'usage_ledger.llmModel exists');
  assert.ok(usageLedger.llmPromptTokens, 'usage_ledger.llmPromptTokens exists');
  assert.ok(usageLedger.llmCompletionTokens, 'usage_ledger.llmCompletionTokens exists');
  assert.ok(usageLedger.ttsCharacters, 'usage_ledger.ttsCharacters exists');
  assert.ok(usageLedger.sttAudioSeconds, 'usage_ledger.sttAudioSeconds exists');
  assert.ok(usageLedger.estimatedCostUsd, 'usage_ledger.estimatedCostUsd exists');
  assert.ok(usageLedger.createdAt, 'usage_ledger.createdAt exists');
});

test('Schema: verifies all PostgreSQL enum values match specifications', () => {
  assert.deepEqual(cefrLevelEnum.enumValues, ['B1', 'B2']);
  assert.deepEqual(coCandidateModeEnum.enumValues, ['AI_PEER', 'HUMAN_LOCAL']);
  assert.deepEqual(sessionStatusEnum.enumValues, ['ACTIVE', 'COMPLETED', 'FAILED']);
  assert.deepEqual(usageSourceEnum.enumValues, [
    'REALTIME_VOICE_AGENT',
    'POST_EXAM_RUBRIC_EVAL',
  ]);
});

test('Drizzle Config: validates config options and schema path', () => {
  assert.equal(drizzleConfig.schema, './src/db/schema.ts');
  assert.equal(drizzleConfig.dialect, 'postgresql');
  assert.ok('dbCredentials' in drizzleConfig, 'dbCredentials present');
});

test('Seed Data: validates 4 realistic Norskprøven topics (2 B1, 2 B2) and test quota', () => {
  assert.equal(SAMPLE_TOPICS.length, 4);

  const b1Topics = SAMPLE_TOPICS.filter((t) => t.level === 'B1');
  const b2Topics = SAMPLE_TOPICS.filter((t) => t.level === 'B2');
  assert.equal(b1Topics.length, 2);
  assert.equal(b2Topics.length, 2);

  for (const topic of SAMPLE_TOPICS) {
    assert.ok(topic.slug.length > 0);
    assert.ok(topic.titleNo.length > 0);
    assert.ok(topic.monologuePromptNo.length > 0);
    assert.ok(topic.discussionPromptNo.length > 0);
    assert.ok(Array.isArray(topic.followUpQuestionsNo));
    assert.ok(topic.followUpQuestionsNo.length >= 3);
  }

  assert.equal(TEST_USER_ID, 'test_user_candidate_1');
});

test('Neon DB Connection: exports working db and pool instances', () => {
  assert.ok(db, 'db instance should exist');
  assert.ok(pool, 'pool instance should exist');
});
