import { describe, it } from 'node:test';
import assert from 'node:assert';
import { signUserToken, verifyUserToken } from '../lib/auth';
import {
  DEFAULT_TIER_CONFIGS,
  DEFAULT_REFERRAL_CONFIG,
  getStartOfCalendarDayOslo,
  getEndOfCalendarDayOslo,
  isRewardActiveToday,
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

