import test from 'node:test';
import assert from 'node:assert/strict';
import { pickEffectiveTier, pickActiveProvider, type EntitlementRow } from '../lib/entitlements';
import { IAP_PRODUCT_IDS, tierForProductId } from '../src/lib/iap-products';

const NOW = new Date('2026-10-21T12:00:00Z');
const FUTURE = new Date('2026-11-21T12:00:00Z');
const PAST = new Date('2026-10-01T12:00:00Z');

test('Entitlements: no subscriptions means FREE', () => {
  assert.equal(pickEffectiveTier([], NOW), 'FREE');
  assert.equal(pickActiveProvider([], NOW), null);
});

test('Entitlements: highest active tier wins across providers', () => {
  const rows: EntitlementRow[] = [
    { tier: 'STANDARD', status: 'ACTIVE', currentPeriodEnd: FUTURE, provider: 'STRIPE' },
    { tier: 'PREMIUM', status: 'ACTIVE', currentPeriodEnd: FUTURE, provider: 'APPLE' },
  ];
  assert.equal(pickEffectiveTier(rows, NOW), 'PREMIUM');
  assert.equal(pickActiveProvider(rows, NOW), 'APPLE');
});

test('Entitlements: canceled web sub does not downgrade an active store sub', () => {
  const rows: EntitlementRow[] = [
    { tier: 'PREMIUM', status: 'CANCELED', currentPeriodEnd: PAST, provider: 'STRIPE' },
    { tier: 'STANDARD', status: 'ACTIVE', currentPeriodEnd: FUTURE, provider: 'GOOGLE' },
  ];
  assert.equal(pickEffectiveTier(rows, NOW), 'STANDARD');
});

test('Entitlements: active status with an elapsed period does not entitle', () => {
  const rows: EntitlementRow[] = [{ tier: 'PREMIUM', status: 'ACTIVE', currentPeriodEnd: PAST }];
  assert.equal(pickEffectiveTier(rows, NOW), 'FREE');
});

test('Entitlements: past-due and inactive subscriptions do not entitle; trialing does', () => {
  assert.equal(pickEffectiveTier([{ tier: 'PREMIUM', status: 'PAST_DUE', currentPeriodEnd: FUTURE }], NOW), 'FREE');
  assert.equal(pickEffectiveTier([{ tier: 'PREMIUM', status: 'INACTIVE', currentPeriodEnd: FUTURE }], NOW), 'FREE');
  assert.equal(pickEffectiveTier([{ tier: 'STANDARD', status: 'TRIALING', currentPeriodEnd: FUTURE }], NOW), 'STANDARD');
});

test('IAP products: product ids map to tiers', () => {
  assert.equal(tierForProductId(IAP_PRODUCT_IDS.STANDARD), 'STANDARD');
  assert.equal(tierForProductId(IAP_PRODUCT_IDS.PREMIUM), 'PREMIUM');
  assert.equal(tierForProductId('com.other.product'), null);
  assert.equal(tierForProductId(undefined), null);
});
