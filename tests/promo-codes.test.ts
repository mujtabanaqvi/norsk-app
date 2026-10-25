import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths,
  checkPromoEligibility,
  generatePromoCode,
  normalizePromoCode,
  promoExternalId,
} from '../lib/promo-codes';
import { pickActiveProvider, pickActiveSubscription, pickEffectiveTier, type EntitlementRow } from '../lib/entitlements';
import { allowUnverifiedIdentity } from '../lib/auth';
import { redeemPromoSchema } from '../app/api/promo/redeem/route';
import { createPromoCodeSchema } from '../app/api/admin/promo-codes/route';
import { updatePromoCodeSchema } from '../app/api/admin/promo-codes/[id]/route';

const NOW = new Date('2026-10-21T12:00:00Z');
const FUTURE = new Date('2026-11-21T12:00:00Z');
const PAST = new Date('2026-10-01T12:00:00Z');

const PROMO = {
  tier: 'PREMIUM' as const,
  discountPercent: 100,
  maxRedemptions: null,
  redemptionCount: 0,
  validFrom: null,
  expiresAt: null,
  isActive: true,
};
const FREE_USER = { effectiveTier: 'FREE' as const, alreadyRedeemed: false };

test('Promo codes: normalizes case and whitespace, rejects junk', () => {
  assert.equal(normalizePromoCode('  spring-2026 '), 'SPRING-2026');
  assert.equal(normalizePromoCode('abc'), null);
  assert.equal(normalizePromoCode('HAS SPACE'), null);
  assert.equal(normalizePromoCode('ÆØÅ2026'), null);
  assert.equal(normalizePromoCode('X'.repeat(33)), null);
});

test('Promo codes: generated codes are valid and skip ambiguous characters', () => {
  for (let i = 0; i < 50; i++) {
    const code = generatePromoCode();
    assert.equal(code.length, 8);
    assert.equal(normalizePromoCode(code), code);
    assert.doesNotMatch(code, /[01OIL]/);
  }
});

test('Promo codes: addMonths clamps to the end of shorter months', () => {
  assert.equal(addMonths(new Date('2026-01-31T10:00:00Z'), 1).toISOString(), '2026-02-28T10:00:00.000Z');
  assert.equal(addMonths(new Date('2028-01-31T10:00:00Z'), 1).toISOString(), '2028-02-29T10:00:00.000Z');
  assert.equal(addMonths(new Date('2026-10-21T12:00:00Z'), 3).toISOString(), '2027-01-21T12:00:00.000Z');
  assert.equal(addMonths(new Date('2026-12-15T00:00:00Z'), 12).toISOString(), '2027-12-15T00:00:00.000Z');
});

test('Promo codes: a free user can redeem an active 100% code', () => {
  assert.equal(checkPromoEligibility(PROMO, FREE_USER, NOW), null);
});

test('Promo codes: every refusal reason', () => {
  assert.equal(checkPromoEligibility(undefined, FREE_USER, NOW), 'NOT_FOUND');
  assert.equal(checkPromoEligibility({ ...PROMO, isActive: false }, FREE_USER, NOW), 'INACTIVE');
  assert.equal(checkPromoEligibility({ ...PROMO, validFrom: FUTURE }, FREE_USER, NOW), 'NOT_STARTED');
  assert.equal(checkPromoEligibility({ ...PROMO, expiresAt: PAST }, FREE_USER, NOW), 'EXPIRED');
  assert.equal(checkPromoEligibility({ ...PROMO, expiresAt: NOW }, FREE_USER, NOW), 'EXPIRED');
  assert.equal(checkPromoEligibility({ ...PROMO, discountPercent: 50 }, FREE_USER, NOW), 'UNSUPPORTED_DISCOUNT');
  assert.equal(
    checkPromoEligibility(PROMO, { effectiveTier: 'FREE', alreadyRedeemed: true }, NOW),
    'ALREADY_REDEEMED'
  );
  assert.equal(
    checkPromoEligibility({ ...PROMO, maxRedemptions: 3, redemptionCount: 3 }, FREE_USER, NOW),
    'EXHAUSTED'
  );
  assert.equal(
    checkPromoEligibility(PROMO, { effectiveTier: 'PREMIUM', alreadyRedeemed: false }, NOW),
    'ALREADY_HAS_TIER'
  );
  assert.equal(
    checkPromoEligibility({ ...PROMO, tier: 'STANDARD' }, { effectiveTier: 'PREMIUM', alreadyRedeemed: false }, NOW),
    'ALREADY_HAS_TIER'
  );
});

test('Promo codes: a paying Standard user can upgrade with a Premium code', () => {
  assert.equal(checkPromoEligibility(PROMO, { effectiveTier: 'STANDARD', alreadyRedeemed: false }, NOW), null);
});

test('Promo codes: code inside its validity window with redemptions left is accepted', () => {
  assert.equal(
    checkPromoEligibility({ ...PROMO, validFrom: PAST, expiresAt: FUTURE, maxRedemptions: 3, redemptionCount: 2 }, FREE_USER, NOW),
    null
  );
});

test('Promo codes: promo grant raises the tier until it expires', () => {
  const active: EntitlementRow[] = [{ tier: 'PREMIUM', status: 'ACTIVE', currentPeriodEnd: FUTURE, provider: 'PROMO' }];
  assert.equal(pickEffectiveTier(active, NOW), 'PREMIUM');
  assert.equal(pickActiveProvider(active, NOW), 'PROMO');

  const expired: EntitlementRow[] = [{ tier: 'PREMIUM', status: 'ACTIVE', currentPeriodEnd: PAST, provider: 'PROMO' }];
  assert.equal(pickEffectiveTier(expired, NOW), 'FREE');
});

test('Promo codes: a paid store subscription of the same tier is reported over a promo grant', () => {
  const rows: EntitlementRow[] = [
    { tier: 'PREMIUM', status: 'ACTIVE', currentPeriodEnd: FUTURE, provider: 'PROMO' },
    { tier: 'PREMIUM', status: 'ACTIVE', currentPeriodEnd: FUTURE, provider: 'GOOGLE' },
  ];
  assert.equal(pickActiveProvider(rows, NOW), 'GOOGLE');
});

test('Promo codes: a higher promo grant wins over a lower paid tier', () => {
  const rows: EntitlementRow[] = [
    { tier: 'STANDARD', status: 'ACTIVE', currentPeriodEnd: FUTURE, provider: 'STRIPE' },
    { tier: 'PREMIUM', status: 'ACTIVE', currentPeriodEnd: FUTURE, provider: 'PROMO' },
  ];
  assert.equal(pickEffectiveTier(rows, NOW), 'PREMIUM');
  assert.equal(pickActiveSubscription(rows, NOW)?.provider, 'PROMO');
});

test('Promo codes: external id is unique per code and user', () => {
  assert.equal(promoExternalId('code-1', 'user-1'), 'promo:code-1:user-1');
});

test('Promo codes: redeem schema requires a code', () => {
  assert.equal(redeemPromoSchema.safeParse({ code: 'SPRING2026' }).success, true);
  assert.equal(redeemPromoSchema.safeParse({ code: '   ' }).success, false);
  assert.equal(redeemPromoSchema.safeParse({}).success, false);
});

test('Promo codes: admin create schema accepts 100% and normalizes the code', () => {
  const parsed = createPromoCodeSchema.safeParse({
    code: ' spring-2026 ',
    tier: 'PREMIUM',
    durationMonths: 3,
    maxRedemptions: 100,
    expiresAt: '2026-12-31T22:59:59.000Z',
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.code, 'SPRING-2026');
    assert.equal(parsed.data.discountPercent, 100);
    assert.ok(parsed.data.expiresAt instanceof Date);
  }
});

test('Promo codes: admin create schema rejects partial discounts and bad input', () => {
  const base = { tier: 'PREMIUM', durationMonths: 3 };
  assert.equal(createPromoCodeSchema.safeParse({ ...base, discountPercent: 50 }).success, false);
  assert.equal(createPromoCodeSchema.safeParse({ ...base, tier: 'FREE' }).success, false);
  assert.equal(createPromoCodeSchema.safeParse({ ...base, durationMonths: 0 }).success, false);
  assert.equal(createPromoCodeSchema.safeParse({ ...base, durationMonths: 25 }).success, false);
  assert.equal(createPromoCodeSchema.safeParse({ ...base, code: 'no' }).success, false);
  assert.equal(createPromoCodeSchema.safeParse({ ...base, expiresAt: 'not a date' }).success, false);
  assert.equal(
    createPromoCodeSchema.safeParse({ ...base, validFrom: '2026-12-01T00:00:00Z', expiresAt: '2026-11-01T00:00:00Z' }).success,
    false
  );
});

test('Promo codes: admin update schema clears dates with empty values', () => {
  const parsed = updatePromoCodeSchema.safeParse({ expiresAt: '', validFrom: null });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.expiresAt, null);
    assert.equal(parsed.data.validFrom, null);
  }
});

test('Auth: unverified identities are refused in production', () => {
  assert.equal(allowUnverifiedIdentity('production'), false);
  assert.equal(allowUnverifiedIdentity('development'), true);
  assert.equal(allowUnverifiedIdentity('test'), true);
  assert.equal(allowUnverifiedIdentity(undefined), true);
});
