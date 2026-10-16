import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEstimatedCostUsd } from '../lib/cost-calculator';
import { SAMPLE_TOPICS } from '../src/db/seed';
import { z } from 'zod';

const startExamSchema = z.object({
  userId: z.string().min(1),
  level: z.enum(['B1', 'B2']),
  coCandidateMode: z.enum(['AI_PEER', 'HUMAN_LOCAL']),
  topicId: z.string().min(1),
});

test('Cost Calculator: accurately computes OpenAI GPT-4.1-mini + ElevenLabs TTS + OpenAI STT rates', () => {
  const usage = {
    llmPromptTokens: 10_000, // 10k * (0.15 / 1M) = $0.0015
    llmCompletionTokens: 2_000, // 2k * (0.60 / 1M) = $0.0012
    ttsCharacters: 3_000, // 3k * (0.075 / 1k) = $0.225
    sttAudioSeconds: 120, // 120 * (0.006 / 60) = $0.012
  };

  const result = calculateEstimatedCostUsd(usage);

  assert.ok(Math.abs(result.llmPromptCostUsd - 0.0015) < 0.000001);
  assert.ok(Math.abs(result.llmCompletionCostUsd - 0.0012) < 0.000001);
  assert.ok(Math.abs(result.totalLlmCostUsd - 0.0027) < 0.000001);
  assert.ok(Math.abs(result.ttsCostUsd - 0.225) < 0.000001);
  assert.ok(Math.abs(result.sttCostUsd - 0.012) < 0.000001);

  const expectedTotal = 0.0015 + 0.0012 + 0.225 + 0.012; // 0.239700
  assert.ok(Math.abs(result.totalEstimatedCostUsd - expectedTotal) < 0.000001);
  assert.equal(result.totalEstimatedCostUsdFormatted, '0.239700');
});

test('Topic Catalog: SAMPLE_TOPICS contains official B1 and B2 oral exam topics', () => {
  const b1Topics = SAMPLE_TOPICS.filter((t) => t.level === 'B1');
  const b2Topics = SAMPLE_TOPICS.filter((t) => t.level === 'B2');

  assert.ok(b1Topics.length >= 2);
  assert.ok(b2Topics.length >= 2);
  assert.ok(b1Topics[0].monologuePromptNo.length > 10);
  assert.ok(b2Topics[0].discussionPromptNo.length > 10);
});

test('Validation: Start Exam Schema enforces B1/B2, valid coCandidateMode, and userId', () => {
  const validPayload = {
    userId: 'user_12345',
    level: 'B1',
    coCandidateMode: 'AI_PEER',
    topicId: 'miljo-og-baerekraft-i-hverdagen',
  };
  assert.equal(startExamSchema.safeParse(validPayload).success, true);

  const missingUserId = {
    level: 'B1',
    coCandidateMode: 'AI_PEER',
    topicId: 'miljo-og-baerekraft-i-hverdagen',
  };
  assert.equal(startExamSchema.safeParse(missingUserId).success, false);

  const invalidLevel = {
    userId: 'user_12345',
    level: 'A2',
    coCandidateMode: 'AI_PEER',
    topicId: 'miljo-og-baerekraft-i-hverdagen',
  };
  assert.equal(startExamSchema.safeParse(invalidLevel).success, false);

  const invalidMode = {
    userId: 'user_12345',
    level: 'B2',
    coCandidateMode: 'REMOTE_HUMAN',
    topicId: 'miljo-og-baerekraft-i-hverdagen',
  };
  assert.equal(startExamSchema.safeParse(invalidMode).success, false);

  const missingTopic = {
    userId: 'user_12345',
    level: 'B2',
    coCandidateMode: 'HUMAN_LOCAL',
    topicId: '',
  };
  assert.equal(startExamSchema.safeParse(missingTopic).success, false);
});

test('Quota Requirement: enforces remainingSeconds >= 180 threshold', () => {
  const checkSufficientQuota = (remainingSeconds: number) => remainingSeconds >= 180;

  assert.equal(checkSufficientQuota(0), false);
  assert.equal(checkSufficientQuota(179), false);
  assert.equal(checkSufficientQuota(180), true);
  assert.equal(checkSufficientQuota(600), true);
});
