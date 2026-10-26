import { Linking, Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import Purchases, {
  type CustomerInfo,
  type PurchasesError,
  type PurchasesPackage,
  type StoreProductChangeInfo,
} from 'react-native-purchases';
import { syncSubscription, type PaidTierResult } from '../api';
import { tierForProductId, type PaidTier } from './iap-products';

/**
 * One payment path for every platform: RevenueCat sells through the App Store on iOS, Google Play on Android
 * and Web Billing (Stripe) on the web. The RevenueCat App User ID is our user id, and after every purchase
 * the server re-reads the subscriber from RevenueCat, so the tier never comes from the client.
 */

const API_KEYS: Partial<Record<typeof Platform.OS, string | undefined>> = {
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  web: process.env.EXPO_PUBLIC_REVENUECAT_WEB_KEY,
};

const apiKey = API_KEYS[Platform.OS];

// Expo Go has no store module (RevenueCat would only run in its mock "preview" mode), so purchases need a development build.
export const isPurchasingSupported = Boolean(apiKey) && !isRunningInExpoGo();

/** Developer-facing reason purchases are disabled on this build, or null when they are supported. */
export const purchasingUnavailableReason: string | null = isRunningInExpoGo()
  ? 'Running in Expo Go, which has no store module. Use a development build (eas build --profile development) or install from a Play/TestFlight track.'
  : !apiKey
    ? `EXPO_PUBLIC_REVENUECAT_${Platform.OS.toUpperCase()}_KEY was not set when this JS bundle was built.`
    : null;

/** Error code RevenueCat returns when a store purchase already belongs to another App User ID (another Snakkly account). */
const RECEIPT_ALREADY_IN_USE = Purchases.PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR;

/** A store purchase is tied to a different Snakkly account than the one logged in. */
export class OwnedByOtherAccountError extends Error {}

/** The store accepted the order but the payment is not complete yet (e.g. a slow Google Play payment method). */
export class PaymentPendingError extends Error {}

let configured = false;

/** Identify the logged-in user to RevenueCat. Call whenever the logged-in user changes. */
export async function configurePurchases(userId: string): Promise<void> {
  if (!isPurchasingSupported) return;
  if (!configured) {
    Purchases.configure({ apiKey: apiKey!, appUserID: userId });
    configured = true;
    return;
  }
  await Purchases.logIn(userId);
}

export async function logOutPurchases(): Promise<void> {
  if (!configured) return;
  await Purchases.logOut().catch(() => {});
}

/** Renewals, expirations and purchases made elsewhere for this user; returns a cleanup function. */
export function addCustomerInfoListener(listener: (info: CustomerInfo) => void): () => void {
  if (!configured) return () => {};
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(listener);
  };
}

/** Package identifiers in the `default` offering (docs/PAYMENTS.md §4.4). */
const PACKAGE_TIER: Record<string, PaidTier> = { standard: 'STANDARD', premium: 'PREMIUM' };

/**
 * Tier of an offering package: by package identifier (works for every store, including Stripe Billing,
 * whose products are Stripe price ids), falling back to our store product ids.
 */
function tierForPackage(pkg: PurchasesPackage): PaidTier | null {
  return PACKAGE_TIER[pkg.identifier.toLowerCase()] ?? tierForProductId(pkg.product.identifier);
}

/** Packages of the current RevenueCat offering, keyed by tier. */
export async function getSubscriptionPackages(): Promise<Partial<Record<PaidTier, PurchasesPackage>>> {
  return (await loadPackages()).byTier;
}

async function loadPackages(): Promise<{
  byTier: Partial<Record<PaidTier, PurchasesPackage>>;
  offeringId: string | null;
  productIds: string[];
}> {
  if (!configured) return { byTier: {}, offeringId: null, productIds: [] };
  const offerings = await Purchases.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  const byTier: Partial<Record<PaidTier, PurchasesPackage>> = {};
  for (const pkg of packages) {
    const tier = tierForPackage(pkg);
    if (tier) byTier[tier] = pkg;
  }
  return {
    byTier,
    offeringId: offerings.current?.identifier ?? null,
    productIds: packages.map((p) => `${p.identifier} → ${p.product.identifier}`),
  };
}

function isPurchasesError(err: unknown): err is PurchasesError {
  return typeof err === 'object' && err !== null && 'code' in err && 'userInfo' in err;
}

function toAppError(err: unknown): unknown {
  if (!isPurchasesError(err)) return err;
  if (err.code === RECEIPT_ALREADY_IN_USE) return new OwnedByOtherAccountError(err.message);
  if (err.code === Purchases.PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return new PaymentPendingError(err.message);
  return err;
}

/**
 * Open the store / Web Billing checkout for a tier. Resolves with the server-confirmed tier,
 * or null if the user cancelled.
 */
export async function buySubscription(tier: PaidTier): Promise<PaidTierResult | null> {
  const { byTier, offeringId, productIds } = await loadPackages();
  const pkg = byTier[tier];
  if (!pkg) {
    // Setup problem in the RevenueCat dashboard (see docs/PAYMENTS.md §4.4): say exactly what was returned.
    throw new Error(
      offeringId
        ? `RevenueCat offering "${offeringId}" has no "${tier.toLowerCase()}" package (packages → products: ${productIds.join(', ') || 'none'}).`
        : 'RevenueCat returned no current offering for this platform.'
    );
  }

  // Google Play: switching between Standard and Premium replaces the existing subscription instead of stacking a second one.
  let productChange: StoreProductChangeInfo | null = null;
  if (Platform.OS === 'android') {
    const info = await Purchases.getCustomerInfo();
    const existing = info.activeSubscriptions.find(
      (id) => tierForProductId(id) && tierForProductId(id) !== tier
    );
    if (existing) {
      productChange = {
        oldProductIdentifier: existing.split(':')[0],
        replacementMode: Purchases.STORE_REPLACEMENT_MODE.WITH_TIME_PRORATION,
      };
    }
  }

  try {
    await Purchases.purchasePackage(pkg, null, productChange);
  } catch (err) {
    if (isPurchasesError(err) && err.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return null;
    throw toAppError(err);
  }
  return syncSubscription();
}

/** Native only: re-attach the store's subscriptions for this Apple ID / Google account to the logged-in user. */
export async function restorePurchases(): Promise<PaidTierResult> {
  try {
    await Purchases.restorePurchases();
  } catch (err) {
    throw toAppError(err);
  }
  return syncSubscription();
}

async function openUrl(url: string): Promise<void> {
  if (Platform.OS === 'web') {
    // The URL is opened after an await, so a popup blocker may refuse the new tab: navigate instead.
    if (!window.open(url, '_blank', 'noopener')) window.location.assign(url);
    return;
  }
  await Linking.openURL(url);
}

/** Opens the place the active subscription is managed: App Store, Google Play or the Web Billing customer portal. */
export async function openManageSubscriptions(): Promise<void> {
  const { managementURL } = await Purchases.getCustomerInfo();
  if (!managementURL) throw new Error('No subscription management URL');
  await openUrl(managementURL);
}

const ANDROID_PACKAGE = 'com.snakkly.app';
const APPLE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

/**
 * - `opened`: the store's / customer portal's cancel page was opened.
 * - `cancelOnIPhone`: an App Store subscription seen from Android or web; it can only be cancelled on an Apple device.
 * - `cancelOnWebsite`: a web subscription seen from the iOS / Android app; it is cancelled on the website.
 */
export type CancelOutcome = 'opened' | 'cancelOnIPhone' | 'cancelOnWebsite';

/**
 * Takes the user to where their subscription can be cancelled. Stores don't let apps cancel subscriptions,
 * so this opens the store that sold it (App Store, Google Play or the Web Billing customer portal),
 * from whichever platform the user is on when that is possible.
 */
export async function openCancelSubscription(
  provider: 'STRIPE' | 'APPLE' | 'GOOGLE',
  productId: string | null | undefined
): Promise<CancelOutcome> {
  if (provider === 'APPLE') {
    if (Platform.OS !== 'ios') return 'cancelOnIPhone';
    if (configured) {
      try {
        await Purchases.showManageSubscriptions();
        return 'opened';
      } catch {
        // Fall back to the App Store page below.
      }
    }
    await openUrl(APPLE_SUBSCRIPTIONS_URL);
    return 'opened';
  }

  if (provider === 'GOOGLE') {
    // Play product ids come through RevenueCat as `<product id>:<base plan>`.
    const sku = productId?.split(':')[0];
    const query = sku ? `?sku=${encodeURIComponent(sku)}&package=${ANDROID_PACKAGE}` : '';
    await openUrl(`https://play.google.com/store/account/subscriptions${query}`);
    return 'opened';
  }

  // Web Billing: the customer portal is only reachable through the web app's RevenueCat session.
  if (Platform.OS !== 'web' || !configured) return 'cancelOnWebsite';
  await openManageSubscriptions();
  return 'opened';
}
