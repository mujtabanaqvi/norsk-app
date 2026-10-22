import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import type { Purchase, ProductSubscription } from 'expo-iap';
import { verifyApplePurchase, verifyGooglePurchase, type PaidTierResult } from '../api';
import { IAP_PRODUCT_IDS, tierForProductId, type PaidTier } from './iap-products';

/**
 * Native in-app purchases (App Store / Google Play) via expo-iap.
 * Purchases are verified by our server before the transaction is finished, so an interrupted
 * verification is replayed by the store on the next launch instead of being lost.
 */

const ANDROID_PACKAGE = 'com.snakkly.app';
const SUBSCRIPTION_SKUS = Object.values(IAP_PRODUCT_IDS);

type ExpoIap = typeof import('expo-iap');

// Expo Go does not contain the expo-iap native module; importing it there crashes the app at startup.
// Store purchases therefore need a development build (`npx expo run:ios`).
// Android does not sell in-app: users subscribe on the web (Stripe) and the app only reads their tier.
// The Google Play code paths below stay dormant so Play Billing can be re-enabled by loading the module on Android.
const iap: ExpoIap | null = Platform.OS === 'ios' && !isRunningInExpoGo() ? require('expo-iap') : null;

export const isIapSupported = iap !== null;

/** False on Android (and Expo Go): the app must not show buy buttons, prices or upsells there. */
export const canPurchaseInApp = Platform.OS === 'web' || isIapSupported;

function store(): ExpoIap {
  if (!iap) throw new Error('In-app purchases are not available in this build');
  return iap;
}

let connected: Promise<boolean> | null = null;
let productCache: ProductSubscription[] | null = null;
/** Set while a purchase sheet opened by the user is outstanding, so background renewals don't open the result screen. */
let userPurchaseInFlight = false;

function ensureConnection(): Promise<boolean> {
  if (!connected) {
    connected = store().initConnection().catch((err) => {
      connected = null;
      throw err;
    });
  }
  return connected;
}

async function verifyOnServer(purchase: Purchase): Promise<PaidTierResult> {
  if (!purchase.purchaseToken) throw new Error('Purchase is missing its token');
  return Platform.OS === 'ios'
    ? verifyApplePurchase(purchase.purchaseToken)
    : verifyGooglePurchase(purchase.purchaseToken);
}

export interface IapListenerHandlers {
  /** `userInitiated` is false for renewals and replays the store delivers on its own. */
  onVerified: (result: PaidTierResult, userInitiated: boolean) => void;
  onPending: () => void;
  onError: (error: unknown) => void;
}

/** Start listening for store purchase events. Call once while a user is logged in; returns a cleanup function. */
export function startIapListener(handlers: IapListenerHandlers): () => void {
  if (!isIapSupported) return () => {};

  const updated = store().purchaseUpdatedListener(async (purchase) => {
    if (!tierForProductId(purchase.productId)) return;
    if (purchase.purchaseState === 'pending') {
      handlers.onPending();
      return;
    }
    const userInitiated = userPurchaseInFlight;
    userPurchaseInFlight = false;
    try {
      const result = await verifyOnServer(purchase);
      await store().finishTransaction({ purchase, isConsumable: false });
      handlers.onVerified(result, userInitiated);
    } catch (err) {
      if (userInitiated) handlers.onError(err);
      else console.warn('Background purchase verification failed; the store will retry it', err);
    }
  });

  const failed = store().purchaseErrorListener((error) => {
    userPurchaseInFlight = false;
    if (!store().isUserCancelledError(error)) handlers.onError(error);
  });

  ensureConnection().catch(handlers.onError);

  return () => {
    updated.remove();
    failed.remove();
    store().endConnection().catch(() => {});
    connected = null;
    productCache = null;
  };
}

/** Store products with localized prices, keyed by tier. */
export async function getSubscriptionProducts(): Promise<Partial<Record<PaidTier, ProductSubscription>>> {
  await ensureConnection();
  if (!productCache) {
    productCache = ((await store().fetchProducts({ skus: SUBSCRIPTION_SKUS, type: 'subs' })) ?? []) as ProductSubscription[];
  }
  const byTier: Partial<Record<PaidTier, ProductSubscription>> = {};
  for (const product of productCache) {
    const tier = tierForProductId(product.id);
    if (tier) byTier[tier] = product;
  }
  return byTier;
}

function androidBasePlanOfferToken(product: ProductSubscription | undefined): string | null {
  const offers = (product as any)?.subscriptionOffers ?? [];
  const basePlan = offers.find((o: any) => o.id === o.basePlanIdAndroid) ?? offers[0];
  return basePlan?.offerTokenAndroid ?? null;
}

/** Open the store purchase sheet. The outcome arrives through the listener started by `startIapListener`. */
export async function buySubscription(tier: PaidTier, iapAccountToken: string): Promise<void> {
  await ensureConnection();
  const sku = IAP_PRODUCT_IDS[tier];
  userPurchaseInFlight = true;
  try {
    await requestStorePurchase(sku, tier, iapAccountToken);
  } catch (err) {
    userPurchaseInFlight = false;
    throw err;
  }
}

async function requestStorePurchase(sku: string, tier: PaidTier, iapAccountToken: string): Promise<void> {
  if (Platform.OS === 'ios') {
    await store().requestPurchase({
      type: 'subs',
      request: { apple: { sku, appAccountToken: iapAccountToken } },
    });
    return;
  }

  const products = await getSubscriptionProducts();
  const offerToken = androidBasePlanOfferToken(products[tier]);
  if (!offerToken) throw new Error(`No Google Play offer found for ${sku}`);

  // Switching between Standard and Premium replaces the existing Play subscription instead of stacking a second one.
  const existing = (await store().getAvailablePurchases()).find(
    (p) => p.productId !== sku && tierForProductId(p.productId)
  );

  await store().requestPurchase({
    type: 'subs',
    request: {
      google: {
        skus: [sku],
        subscriptionOffers: [{ sku, offerToken }],
        obfuscatedAccountId: iapAccountToken,
        ...(existing?.purchaseToken
          ? {
              purchaseToken: existing.purchaseToken,
              subscriptionProductReplacementParams: {
                oldProductId: existing.productId,
                replacementMode: 'with-time-proration',
              },
            }
          : {}),
      },
    },
  });
}

/** Re-verify every subscription the store still holds for this device's Apple ID / Google account. */
export async function restorePurchases(): Promise<PaidTierResult | null> {
  await ensureConnection();
  await store().restorePurchases();
  let best: PaidTierResult | null = null;
  for (const purchase of await store().getAvailablePurchases()) {
    if (!tierForProductId(purchase.productId)) continue;
    const result = await verifyOnServer(purchase);
    await store().finishTransaction({ purchase, isConsumable: false }).catch(() => {});
    if (!best || result.tier === 'PREMIUM') best = result;
  }
  return best;
}

export function openManageSubscriptions(tier?: PaidTier): Promise<void> {
  return store().deepLinkToSubscriptions({
    packageNameAndroid: ANDROID_PACKAGE,
    skuAndroid: tier ? IAP_PRODUCT_IDS[tier] : undefined,
  });
}
