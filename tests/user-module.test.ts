import { describe, it } from 'node:test';
import assert from 'node:assert';
import { signUserToken, verifyUserToken } from '../lib/auth';
import { DEFAULT_TIER_CONFIGS, DEFAULT_REFERRAL_CONFIG, getStartOfCalendarDayOslo } from '../lib/tier-policy';

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
});

