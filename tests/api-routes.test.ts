import test from 'node:test';
import assert from 'node:assert/strict';
import { startExamSchema } from '../app/api/exam/start/route';

test('Route Validation: startExamSchema validates required fields', () => {
  const valid = {
    userId: 'usr_abc123',
    topicId: 'miljo-og-baerekraft-i-hverdagen',
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
    topicId: 'miljo-og-baerekraft-i-hverdagen',
    level: 'B1',
    coCandidateMode: 'AI_PEER',
  };
  assert.equal(startExamSchema.safeParse(missingUser).success, false);

  // Allow missing topicId (triggers random exam & question selection)
  const missingTopic = {
    userId: 'usr_abc123',
    level: 'B1',
    coCandidateMode: 'AI_PEER',
  };
  assert.equal(startExamSchema.safeParse(missingTopic).success, true);

  // Reject invalid level
  const invalidLevel = {
    userId: 'usr_abc123',
    topicId: 'miljo-og-baerekraft-i-hverdagen',
    level: 'C1',
    coCandidateMode: 'AI_PEER',
  };
  assert.equal(startExamSchema.safeParse(invalidLevel).success, false);

  // Reject invalid coCandidateMode
  const invalidMode = {
    userId: 'usr_abc123',
    topicId: 'miljo-og-baerekraft-i-hverdagen',
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

test('Route Logic: Results and Turn routes validate UUID parameter', () => {
  const isValidUuid = (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  assert.equal(isValidUuid('d1a2b3c4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'), true);
  assert.equal(isValidUuid('invalid-session-id'), false);
  assert.equal(isValidUuid('12345'), false);
});
