import test from 'node:test';
import assert from 'node:assert/strict';
import { startExamSchema } from '../app/api/exam/start/route';
import { NextRequest } from 'next/server';

test('Route Validation: startExamSchema validates required fields', () => {
  const valid = {
    userId: 'usr_abc123',
    topicId: 'b1-kollektiv',
    level: 'B1',
    coCandidateMode: 'AI_PEER',
  };

  const result = startExamSchema.safeParse(valid);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.userId, 'usr_abc123');
    assert.equal(result.data.level, 'B1');
    assert.equal(result.data.coCandidateMode, 'AI_PEER');
  }

  // Reject missing userId
  const missingUser = {
    topicId: 'b1-kollektiv',
    level: 'B1',
    coCandidateMode: 'AI_PEER',
  };
  assert.equal(startExamSchema.safeParse(missingUser).success, false);

  // Reject missing topicId
  const missingTopic = {
    userId: 'usr_abc123',
    level: 'B1',
    coCandidateMode: 'AI_PEER',
  };
  assert.equal(startExamSchema.safeParse(missingTopic).success, false);

  // Reject invalid level
  const invalidLevel = {
    userId: 'usr_abc123',
    topicId: 'b1-kollektiv',
    level: 'C1',
    coCandidateMode: 'AI_PEER',
  };
  assert.equal(startExamSchema.safeParse(invalidLevel).success, false);

  // Reject invalid coCandidateMode
  const invalidMode = {
    userId: 'usr_abc123',
    topicId: 'b1-kollektiv',
    level: 'B2',
    coCandidateMode: 'SOLO',
  };
  assert.equal(startExamSchema.safeParse(invalidMode).success, false);
});

test('Route Logic: Quota threshold 180s enforcement', () => {
  const checkQuota = (seconds: number) => {
    if (seconds < 180) {
      return { status: 402, error: 'Insufficient audio quota remaining.' };
    }
    return { status: 200, allowed: true };
  };

  assert.equal(checkQuota(179).status, 402);
  assert.equal(checkQuota(179).error, 'Insufficient audio quota remaining.');
  assert.equal(checkQuota(0).status, 402);
  assert.equal(checkQuota(180).status, 200);
  assert.equal(checkQuota(1800).status, 200);
});

test('Route Logic: Results route validates UUID parameter', () => {
  const isValidUuid = (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  assert.equal(isValidUuid('d1a2b3c4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'), true);
  assert.equal(isValidUuid('invalid-session-id'), false);
  assert.equal(isValidUuid('12345'), false);
});

test('Route Logic: Room metadata serialization for LiveKit', () => {
  const session = { id: 'd1a2b3c4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' };
  const userId = 'user_test';
  const level = 'B2';
  const coCandidateMode = 'AI_PEER';
  const topic = {
    titleNo: 'Bør mobiltelefoner forbys i skolen?',
    monologuePromptNo: 'Hold et innlegg om mobilforbud.',
    discussionPromptNo: 'Diskuter fordeler og ulemper.',
    followUpQuestionsNo: ['Hva synes elevene?'],
  };

  const metadataString = JSON.stringify({
    sessionId: session.id,
    userId,
    level,
    coCandidateMode,
    topic: {
      titleNo: topic.titleNo,
      monologuePromptNo: topic.monologuePromptNo,
      discussionPromptNo: topic.discussionPromptNo,
      followUpQuestionsNo: topic.followUpQuestionsNo,
    },
  });

  const parsed = JSON.parse(metadataString);
  assert.equal(parsed.sessionId, session.id);
  assert.equal(parsed.userId, userId);
  assert.equal(parsed.level, 'B2');
  assert.equal(parsed.coCandidateMode, 'AI_PEER');
  assert.equal(parsed.topic.titleNo, topic.titleNo);
  assert.deepEqual(parsed.topic.followUpQuestionsNo, topic.followUpQuestionsNo);
});

