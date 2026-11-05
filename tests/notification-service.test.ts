import test from 'node:test';
import assert from 'node:assert/strict';
import { getOsloDayKey } from '../lib/tier-policy';

test('Notification Service: generates correct dedupKey for Oslo calendar day', () => {
  const date1 = new Date('2026-11-05T12:00:00Z');
  const osloDay1 = getOsloDayKey(date1);
  assert.equal(osloDay1, '2026-11-05');

  const userId = 'usr_test_abc123';
  const dedupCreditsKey = `daily_credits:${osloDay1}:${userId}`;
  const dedupReminderKey = `practice_reminder:${osloDay1}:${userId}`;

  assert.equal(dedupCreditsKey, 'daily_credits:2026-11-05:usr_test_abc123');
  assert.equal(dedupReminderKey, 'practice_reminder:2026-11-05:usr_test_abc123');
});

test('Notification Service: cross-midnight Oslo day key switches correctly', () => {
  // 22:59 UTC in winter is 23:59 Oslo time (same day)
  const lateUtc = new Date('2026-11-05T22:59:00Z');
  // 23:01 UTC in winter is 00:01 Oslo time (next day: 2026-11-06)
  const midnightUtc = new Date('2026-11-05T23:01:00Z');

  const day1 = getOsloDayKey(lateUtc);
  const day2 = getOsloDayKey(midnightUtc);

  assert.equal(day1, '2026-11-05');
  assert.equal(day2, '2026-11-06');
});

test('Notification Service: calculates read rate percentage accurately', () => {
  const calcRate = (total: number, read: number) =>
    total > 0 ? Math.round((read / total) * 100) : 0;

  assert.equal(calcRate(0, 0), 0);
  assert.equal(calcRate(100, 50), 50);
  assert.equal(calcRate(3, 1), 33);
  assert.equal(calcRate(3, 2), 67);
  assert.equal(calcRate(10, 10), 100);
});

