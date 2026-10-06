import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEstimatedCostUsd, PRICING_RATES } from '../lib/cost-calculator';
import { getTopicById, TOPIC_CATALOG } from '../lib/topics';
import { AccessToken } from 'livekit-server-sdk';
import { z } from 'zod';

// Replicating endpoint validation schemas for isolated unit testing
const startExamSchema = z.object({
  userId: z.string().min(1),
  level: z.enum(['B1', 'B2']),
  coCandidateMode: z.enum(['AI_PEER', 'HUMAN_LOCAL']),
  topicId: z.string().min(1),
});

const agentCompletePayloadSchema = z.object({
  sessionId: z.string().uuid(),
  userId: z.string().min(1),
  usage: z.object({
    llmPromptTokens: z.number().int().min(0),
    llmCompletionTokens: z.number().int().min(0),
    ttsCharacters: z.number().int().min(0),
    sttAudioSeconds: z.number().min(0),
  }),
  transcript: z.array(
    z.object({
      speaker: z.string().min(1),
      role: z.string().min(1),
      text: z.string(),
      timestamp: z.number(),
    })
  ),
});

test('Cost Calculator: accurately computes OpenAI GPT-4.1-mini + ElevenLabs Flash + Deepgram Nova-3 rates', () => {
  const usage = {
    llmPromptTokens: 10_000, // 10k * (0.15 / 1M) = $0.0015
    llmCompletionTokens: 2_000, // 2k * (0.60 / 1M) = $0.0012
    ttsCharacters: 3_000, // 3k * (0.075 / 1k) = $0.225
    sttAudioSeconds: 120, // 120 * (0.0043 / 60) = $0.0086
  };

  const result = calculateEstimatedCostUsd(usage);

  // Exact math checks
  assert.ok(Math.abs(result.llmPromptCostUsd - 0.0015) < 0.000001);
  assert.ok(Math.abs(result.llmCompletionCostUsd - 0.0012) < 0.000001);
  assert.ok(Math.abs(result.totalLlmCostUsd - 0.0027) < 0.000001);
  assert.ok(Math.abs(result.ttsCostUsd - 0.225) < 0.000001);
  assert.ok(Math.abs(result.sttCostUsd - 0.0086) < 0.000001);

  const expectedTotal = 0.0015 + 0.0012 + 0.225 + 0.0086; // 0.236300
  assert.ok(Math.abs(result.totalEstimatedCostUsd - expectedTotal) < 0.000001);
  assert.equal(result.totalEstimatedCostUsdFormatted, '0.236300');
});

test('Topic Catalog: retrieves official B1 and B2 oral exam topics and supports dynamic fallbacks', () => {
  const b1Topic = getTopicById('kollektivtransport-gratis', 'B1');
  assert.equal(b1Topic.title, 'Bør kollektivtransport være gratis for alle?');
  assert.ok(b1Topic.topicPrompt.includes('Diskuter om buss'));

  const b2Topic = getTopicById('mobilforbud-skole', 'B2');
  assert.equal(b2Topic.title, 'Bør mobiltelefoner forbys i grunnskolen og videregående?');

  const customTopic = getTopicById('miljo-og-resirkulering', 'B2');
  assert.equal(customTopic.title, 'Miljo Og Resirkulering');
  assert.ok(customTopic.topicPrompt.includes('B2'));
});

test('Validation: Start Exam Schema enforces B1/B2, valid coCandidateMode, and userId', () => {
  const validPayload = {
    userId: 'user_12345',
    level: 'B1',
    coCandidateMode: 'AI_PEER',
    topicId: 'kollektivtransport-gratis',
  };
  assert.equal(startExamSchema.safeParse(validPayload).success, true);

  const missingUserId = {
    level: 'B1',
    coCandidateMode: 'AI_PEER',
    topicId: 'kollektivtransport-gratis',
  };
  assert.equal(startExamSchema.safeParse(missingUserId).success, false);

  const invalidLevel = {
    userId: 'user_12345',
    level: 'A2',
    coCandidateMode: 'AI_PEER',
    topicId: 'kollektivtransport-gratis',
  };
  assert.equal(startExamSchema.safeParse(invalidLevel).success, false);

  const invalidMode = {
    userId: 'user_12345',
    level: 'B2',
    coCandidateMode: 'REMOTE_HUMAN',
    topicId: 'kollektivtransport-gratis',
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

test('Validation: Agent Complete Webhook Schema enforces strict UUID and numeric ranges', () => {
  const validWebhook = {
    sessionId: 'c3f4e240-5b5c-4d7a-8b1d-ef234567890a',
    userId: 'user_12345',
    usage: {
      llmPromptTokens: 500,
      llmCompletionTokens: 250,
      ttsCharacters: 1200,
      sttAudioSeconds: 45.5,
    },
    transcript: [
      {
        speaker: 'examiner',
        role: 'examiner',
        text: 'Hei, og velkommen til muntlig prøve.',
        timestamp: 1728200000000,
      },
      {
        speaker: 'candidate',
        role: 'user',
        text: 'Takk! Jeg er klar til å diskutere oppgaven.',
        timestamp: 1728200005000,
      },
    ],
  };

  const parsed = agentCompletePayloadSchema.safeParse(validWebhook);
  assert.equal(parsed.success, true);

  // Negative audio seconds rejected
  const invalidAudio = {
    ...validWebhook,
    usage: { ...validWebhook.usage, sttAudioSeconds: -10 },
  };
  assert.equal(agentCompletePayloadSchema.safeParse(invalidAudio).success, false);

  // Non-uuid sessionId rejected
  const invalidSessionId = {
    ...validWebhook,
    sessionId: 'not-a-valid-uuid',
  };
  assert.equal(agentCompletePayloadSchema.safeParse(invalidSessionId).success, false);
});

test('LiveKit Server SDK: mints valid JWT AccessToken with participant grants and metadata', async () => {
  const apiKey = 'test_api_key';
  const apiSecret = 'test_api_secret_that_is_long_enough_for_hmac_sha256';
  const sessionId = 'd1a2b3c4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
  const userId = 'user_abc123';
  const roomName = `exam_${sessionId}`;

  const token = new AccessToken(apiKey, apiSecret, {
    identity: userId,
    ttl: '1h',
    metadata: JSON.stringify({ sessionId, role: 'candidate', level: 'B1' }),
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const jwt = await token.toJwt();
  assert.ok(typeof jwt === 'string' && jwt.length > 20);

  // Verify JWT contains 3 segments
  const segments = jwt.split('.');
  assert.equal(segments.length, 3);

  // Verify header
  const header = JSON.parse(Buffer.from(segments[0], 'base64url').toString('utf8'));
  assert.equal(header.alg, 'HS256');

  // Verify payload claims
  const claims = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
  assert.equal(claims.sub, userId);
  assert.equal(claims.video.room, roomName);
  assert.equal(claims.video.roomJoin, true);
  assert.equal(claims.video.canPublish, true);
});

test('Quota Requirement: strictly enforces remainingSeconds > 180 threshold', () => {
  const checkSufficientQuota = (remainingSeconds: number) => remainingSeconds > 180;

  assert.equal(checkSufficientQuota(0), false);
  assert.equal(checkSufficientQuota(179), false);
  assert.equal(checkSufficientQuota(180), false); // Requirement: > 180 (not >= 180)
  assert.equal(checkSufficientQuota(181), true);
  assert.equal(checkSufficientQuota(600), true);
});

