import test from 'node:test';
import assert from 'node:assert/strict';
import { pickEffectiveTier, pickActiveProvider, type EntitlementRow } from '../lib/entitlements';
import { mapAppleTransaction } from '../lib/iap/apple-sync';
import { mapGoogleSubscription } from '../lib/iap/google';
import { IAP_PRODUCT_IDS, tierForProductId } from '../src/lib/iap-products';
import { isAllowedReturnUrl } from '../lib/stripe';

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

test('Entitlements: canceled Stripe sub does not downgrade an active store sub', () => {
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

test('Apple: active, auto-renew off, grace period and revoked transactions', () => {
  const tx = { purchaseDate: PAST.getTime(), expiresDate: FUTURE.getTime() };

  const active = mapAppleTransaction(tx, { autoRenewStatus: 1 }, NOW);
  assert.equal(active.status, 'ACTIVE');
  assert.equal(active.cancelAtPeriodEnd, false);
  assert.equal(active.currentPeriodEnd.getTime(), FUTURE.getTime());

  assert.equal(mapAppleTransaction(tx, { autoRenewStatus: 0 }, NOW).cancelAtPeriodEnd, true);

  const expired = mapAppleTransaction({ purchaseDate: PAST.getTime(), expiresDate: PAST.getTime() + 1000 }, null, NOW);
  assert.equal(expired.status, 'CANCELED');

  const grace = mapAppleTransaction(
    { purchaseDate: PAST.getTime(), expiresDate: PAST.getTime() + 1000 },
    { autoRenewStatus: 1, gracePeriodExpiresDate: FUTURE.getTime() },
    NOW
  );
  assert.equal(grace.status, 'ACTIVE');

  const revoked = mapAppleTransaction({ ...tx, revocationDate: NOW.getTime() - 1000 }, null, NOW);
  assert.equal(revoked.status, 'CANCELED');
});

test('Google: subscription states map to our statuses', () => {
  const base = {
    startTime: PAST.toISOString(),
    lineItems: [{ productId: IAP_PRODUCT_IDS.STANDARD, expiryTime: FUTURE.toISOString(), autoRenewingPlan: { autoRenewEnabled: true } }],
  };
  assert.equal(mapGoogleSubscription({ ...base, subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' }, NOW).status, 'ACTIVE');
  assert.equal(mapGoogleSubscription({ ...base, subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' }, NOW).status, 'ACTIVE');
  assert.equal(mapGoogleSubscription({ ...base, subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD' }, NOW).status, 'PAST_DUE');
  assert.equal(mapGoogleSubscription({ ...base, subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' }, NOW).status, 'CANCELED');

  // Canceled = auto-renew off; access continues until expiry.
  const canceled = mapGoogleSubscription(
    {
      startTime: PAST.toISOString(),
      subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
      lineItems: [{ productId: IAP_PRODUCT_IDS.STANDARD, expiryTime: FUTURE.toISOString(), autoRenewingPlan: { autoRenewEnabled: false } }],
    },
    NOW
  );
  assert.equal(canceled.status, 'ACTIVE');
  assert.equal(canceled.cancelAtPeriodEnd, true);
});

test('Stripe checkout: return URLs must stay on our own origins', () => {
  const allowed = ['http://localhost:8081', 'https://snakkly.no'];
  assert.equal(isAllowedReturnUrl('http://localhost:8081/payment/success?session_id={CHECKOUT_SESSION_ID}', allowed), true);
  assert.equal(isAllowedReturnUrl('https://snakkly.no/payment/canceled', allowed), true);
  assert.equal(isAllowedReturnUrl('https://evil.example/payment/success', allowed), false);
  assert.equal(isAllowedReturnUrl('not a url', allowed), false);
});
