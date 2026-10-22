import test from 'node:test';
import assert from 'node:assert/strict';
import { isRevenueCatAnonymousId, mapSubscriberToRows, type RevenueCatSubscription } from '../lib/revenuecat';
import { pickEffectiveTier, pickActiveProvider } from '../lib/entitlements';
import { tierForProductId } from '../src/lib/iap-products';

const NOW = new Date('2026-10-21T12:00:00Z');
const PURCHASED = '2026-10-01T12:00:00Z';
const FUTURE = '2026-11-01T12:00:00Z';
const PAST = '2026-10-15T12:00:00Z';
const USER = 'user-1';

function sub(overrides: Partial<RevenueCatSubscription>): RevenueCatSubscription {
  return { store: 'app_store', purchase_date: PURCHASED, expires_date: FUTURE, period_type: 'normal', ...overrides };
}

function mapOne(productId: string, s: RevenueCatSubscription) {
  return mapSubscriberToRows(USER, { subscriptions: { [productId]: s } }, NOW);
}

test('RevenueCat: active App Store subscription maps to an ACTIVE Apple row', () => {
  const [row] = mapOne('snakkly.standard.monthly', sub({}));
  assert.equal(row.provider, 'APPLE');
  assert.equal(row.tier, 'STANDARD');
  assert.equal(row.status, 'ACTIVE');
  assert.equal(row.externalId, 'rc:user-1:snakkly.standard.monthly');
  assert.equal(row.currentPeriodEnd.toISOString(), new Date(FUTURE).toISOString());
  assert.equal(row.cancelAtPeriodEnd, false);
  assert.equal(row.environment, 'production');
});

test('RevenueCat: Play base-plan product ids and stores map to Google', () => {
  const [row] = mapOne('snakkly.premium.monthly:monthly', sub({ store: 'play_store', is_sandbox: true }));
  assert.equal(row.provider, 'GOOGLE');
  assert.equal(row.tier, 'PREMIUM');
  assert.equal(row.environment, 'sandbox');
  assert.equal(tierForProductId('snakkly.premium.monthly:monthly'), 'PREMIUM');
});

test('RevenueCat: Web Billing subscriptions map to the STRIPE provider', () => {
  assert.equal(mapOne('snakkly.standard.monthly', sub({ store: 'rc_billing' }))[0].provider, 'STRIPE');
});

test('RevenueCat: trial, cancelled-in-period, expired, billing issue and refunded states', () => {
  assert.equal(mapOne('snakkly.standard.monthly', sub({ period_type: 'trial' }))[0].status, 'TRIALING');

  const cancelled = mapOne('snakkly.standard.monthly', sub({ unsubscribe_detected_at: PAST }))[0];
  assert.equal(cancelled.status, 'ACTIVE');
  assert.equal(cancelled.cancelAtPeriodEnd, true);

  assert.equal(mapOne('snakkly.standard.monthly', sub({ expires_date: PAST }))[0].status, 'CANCELED');
  assert.equal(
    mapOne('snakkly.standard.monthly', sub({ expires_date: PAST, billing_issues_detected_at: PAST }))[0].status,
    'PAST_DUE'
  );
  assert.equal(mapOne('snakkly.standard.monthly', sub({ refunded_at: PAST }))[0].status, 'CANCELED');
});

test('RevenueCat: unknown products, unknown stores and non-expiring entries are skipped', () => {
  assert.deepEqual(mapOne('com.other.product', sub({})), []);
  assert.deepEqual(mapOne('snakkly.standard.monthly', sub({ store: 'promotional' })), []);
  assert.deepEqual(mapOne('snakkly.standard.monthly', sub({ expires_date: null })), []);
});

test('RevenueCat: Premium plus an expired Standard yields Premium', () => {
  const rows = mapSubscriberToRows(
    USER,
    {
      subscriptions: {
        'snakkly.standard.monthly': sub({ store: 'play_store', expires_date: PAST }),
        'snakkly.premium.monthly': sub({ store: 'rc_billing' }),
      },
    },
    NOW
  );
  assert.equal(rows.length, 2);
  assert.equal(pickEffectiveTier(rows, NOW), 'PREMIUM');
  assert.equal(pickActiveProvider(rows, NOW), 'STRIPE');
});

test('RevenueCat: anonymous app user ids are recognised', () => {
  assert.equal(isRevenueCatAnonymousId('$RCAnonymousID:abc'), true);
  assert.equal(isRevenueCatAnonymousId('user-1'), false);
});

test('RevenueCat: Stripe Billing price ids map to a tier through their entitlement', () => {
  const rows = mapSubscriberToRows(
    USER,
    {
      subscriptions: {
        price_standard123: sub({ store: 'stripe' }),
        price_premium456: sub({ store: 'stripe' }),
      },
      entitlements: {
        standard: { product_identifier: 'price_standard123', expires_date: FUTURE },
        premium: { product_identifier: 'price_premium456', expires_date: FUTURE },
      },
    },
    NOW
  );
  assert.deepEqual(
    rows.map((r) => [r.productId, r.tier, r.provider]),
    [
      ['price_standard123', 'STANDARD', 'STRIPE'],
      ['price_premium456', 'PREMIUM', 'STRIPE'],
    ]
  );
});

test('RevenueCat: a product granting both entitlements counts as Premium', () => {
  const [row] = mapSubscriberToRows(
    USER,
    {
      subscriptions: { price_premium456: sub({ store: 'stripe' }) },
      entitlements: {
        standard: { product_identifier: 'price_premium456' },
        premium: { product_identifier: 'price_premium456' },
      },
    },
    NOW
  );
  assert.equal(row.tier, 'PREMIUM');
});

test('RevenueCat: a product no longer behind an entitlement keeps its stored tier', () => {
  const externalId = 'rc:user-1:price_standard123';
  const rows = mapSubscriberToRows(
    USER,
    { subscriptions: { price_standard123: sub({ store: 'stripe', expires_date: PAST }) }, entitlements: {} },
    NOW,
    new Map([[externalId, 'STANDARD' as const]])
  );
  assert.equal(rows[0].tier, 'STANDARD');
  assert.equal(rows[0].status, 'CANCELED');
  // Without a stored tier it is skipped, as before.
  assert.deepEqual(
    mapSubscriberToRows(USER, { subscriptions: { price_x: sub({ store: 'stripe' }) } }, NOW),
    []
  );
});
