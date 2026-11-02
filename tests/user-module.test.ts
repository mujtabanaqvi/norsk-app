import { describe, it } from 'node:test';
import assert from 'node:assert';
import { signUserToken, verifyUserToken } from '../lib/auth';
import {
  DEFAULT_TIER_CONFIGS,
  DEFAULT_REFERRAL_CONFIG,
  getStartOfCalendarDayOslo,
  getEndOfCalendarDayOslo,
  isRewardActiveToday,
  computeAudioRemaining,
  getOsloDayKey,
} from '../lib/tier-policy';

describe('User Module Unit Tests', () => {
  it('should sign and verify JWT tokens correctly', () => {
    const payload = {
      id: 'usr_test_123',
      email: 'test@example.com',
      role: 'USER',
    };

    const token = signUserToken(payload);
    assert.ok(typeof token === 'string' && token.length > 20);

    const verified = verifyUserToken(token);
    assert.strictEqual(verified.sub, payload.id);
    assert.strictEqual(verified.email, payload.email);
    assert.strictEqual(verified.role, payload.role);
  });

  it('should have default tier policies configured', () => {
    assert.strictEqual(DEFAULT_TIER_CONFIGS.FREE.dailyTestLimit, 1);
    assert.strictEqual(DEFAULT_TIER_CONFIGS.STANDARD.dailyTestLimit, 5);
    assert.strictEqual(DEFAULT_TIER_CONFIGS.PREMIUM.dailyTestLimit, 20);

    assert.strictEqual(DEFAULT_TIER_CONFIGS.FREE.priceCents, 0);
    assert.strictEqual(DEFAULT_TIER_CONFIGS.STANDARD.priceCents, 14900);
    assert.strictEqual(DEFAULT_TIER_CONFIGS.PREMIUM.priceCents, 29900);
  });

  it('should give every tier a daily speaking-time allowance', () => {
    assert.strictEqual(DEFAULT_TIER_CONFIGS.FREE.dailyAudioMinutes, 30);
    assert.strictEqual(DEFAULT_TIER_CONFIGS.STANDARD.dailyAudioMinutes, 90);
    assert.strictEqual(DEFAULT_TIER_CONFIGS.PREMIUM.dailyAudioMinutes, 180);
  });

  it('should compute speaking time left today and reset it on a new Oslo day', () => {
    const today = '2026-11-02';
    // Same day: allowance minus usage
    assert.deepStrictEqual(computeAudioRemaining({ usedToday: 600, usageDay: today }, 5400, today), {
      usedTodaySeconds: 600,
      remainingAudioSeconds: 4800,
    });
    // Usage from yesterday (or never recorded) no longer counts
    assert.strictEqual(computeAudioRemaining({ usedToday: 5400, usageDay: '2026-11-01' }, 5400, today).remainingAudioSeconds, 5400);
    assert.strictEqual(computeAudioRemaining({ usedToday: 0, usageDay: null }, 1800, today).remainingAudioSeconds, 1800);
    assert.strictEqual(computeAudioRemaining(undefined, 1800, today).remainingAudioSeconds, 1800);
    // Admin top-up beyond usage adds time for today
    assert.strictEqual(computeAudioRemaining({ usedToday: -600, usageDay: today }, 1800, today).remainingAudioSeconds, 2400);
    // Never negative, even if the allowance was lowered below today's usage
    assert.strictEqual(computeAudioRemaining({ usedToday: 2000, usageDay: today }, 1800, today).remainingAudioSeconds, 0);
  });

  it('should key the day by Oslo time, not UTC', () => {
    // 23:30 UTC on Nov 1 is already Nov 2 in Oslo (UTC+1)
    assert.strictEqual(getOsloDayKey(new Date('2026-11-01T23:30:00Z')), '2026-11-02');
    assert.strictEqual(getOsloDayKey(new Date('2026-11-01T22:30:00Z')), '2026-11-01');
  });

  it('should have default referral reward settings configured', () => {
    assert.strictEqual(DEFAULT_REFERRAL_CONFIG.bonusDailyTests, 2);
    assert.strictEqual(DEFAULT_REFERRAL_CONFIG.durationDays, 7);
  });

  it('should correctly compute Oslo calendar day midnight start', () => {
    const startOfDay = getStartOfCalendarDayOslo(new Date());
    assert.ok(startOfDay instanceof Date);
    assert.ok(!isNaN(startOfDay.getTime()));
  });

  it('should use the Oslo offset for midnight in winter and summer', () => {
    assert.strictEqual(getStartOfCalendarDayOslo(new Date('2026-01-15T12:00:00Z')).toISOString(), '2026-01-14T23:00:00.000Z');
    assert.strictEqual(getStartOfCalendarDayOslo(new Date('2026-07-15T12:00:00Z')).toISOString(), '2026-07-14T22:00:00.000Z');
  });

  it('should count just after Oslo midnight as the new day', () => {
    // 00:30 Oslo on 15 July
    assert.strictEqual(getStartOfCalendarDayOslo(new Date('2026-07-14T22:30:00Z')).toISOString(), '2026-07-14T22:00:00.000Z');
  });

  it('should handle the 25-hour DST change day', () => {
    const noon = new Date('2026-10-25T12:00:00Z');
    assert.strictEqual(getStartOfCalendarDayOslo(noon).toISOString(), '2026-10-24T22:00:00.000Z');
    assert.strictEqual(getEndOfCalendarDayOslo(noon).toISOString(), '2026-10-25T23:00:00.000Z');
  });

  it('should keep a referral reward active for the whole day it expires on', () => {
    const reward = { startsAt: new Date('2026-10-18T08:00:00Z'), expiresAt: new Date('2026-10-25T09:00:00Z') };
    assert.strictEqual(isRewardActiveToday(reward, new Date('2026-10-25T17:00:00Z')), true);
    assert.strictEqual(isRewardActiveToday(reward, new Date('2026-10-26T08:00:00Z')), false);
  });

  it('should count a referral reward that starts later today', () => {
    const reward = { startsAt: new Date('2026-10-25T20:00:00Z'), expiresAt: new Date('2026-11-01T20:00:00Z') };
    assert.strictEqual(isRewardActiveToday(reward, new Date('2026-10-25T08:00:00Z')), true);
    assert.strictEqual(isRewardActiveToday(reward, new Date('2026-10-24T08:00:00Z')), false);
  });
});

