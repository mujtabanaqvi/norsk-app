import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import type { SubscriptionStatus } from '@/lib/entitlements';

export const GOOGLE_PLAY_PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.snakkly.app';
const API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

/** Subset of the Play Developer API SubscriptionPurchaseV2 resource that we use. */
export interface GoogleSubscriptionPurchase {
  subscriptionState?: string;
  acknowledgementState?: string;
  startTime?: string;
  linkedPurchaseToken?: string;
  testPurchase?: object;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
  }>;
}

let auth: GoogleAuth | null = null;

function getAuth(): GoogleAuth {
  if (!auth) {
    const json = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
    if (!json) throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not configured');
    auth = new GoogleAuth({
      credentials: JSON.parse(json),
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
  }
  return auth;
}

export async function getGoogleSubscription(purchaseToken: string): Promise<GoogleSubscriptionPurchase> {
  const url = `${API_BASE}/${GOOGLE_PLAY_PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const res = await getAuth().request<GoogleSubscriptionPurchase>({ url, method: 'GET' });
  return res.data;
}

/** Google refunds subscriptions that are not acknowledged within 3 days, so the server acknowledges after verifying. */
export async function acknowledgeGoogleSubscription(productId: string, purchaseToken: string): Promise<void> {
  const url = `${API_BASE}/${GOOGLE_PLAY_PACKAGE_NAME}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
  await getAuth().request({ url, method: 'POST', data: {} });
}

export interface GoogleSubscriptionState {
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export function mapGoogleSubscription(sub: GoogleSubscriptionPurchase, now: Date = new Date()): GoogleSubscriptionState {
  const item = sub.lineItems?.[0];
  const end = new Date(item?.expiryTime ?? now.getTime());
  const notExpired = end.getTime() > now.getTime();
  let status: SubscriptionStatus;
  switch (sub.subscriptionState) {
    case 'SUBSCRIPTION_STATE_ACTIVE':
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
      status = 'ACTIVE';
      break;
    case 'SUBSCRIPTION_STATE_CANCELED':
      // Auto-renew turned off: access continues until the paid period ends.
      status = notExpired ? 'ACTIVE' : 'CANCELED';
      break;
    case 'SUBSCRIPTION_STATE_ON_HOLD':
      status = 'PAST_DUE';
      break;
    case 'SUBSCRIPTION_STATE_PAUSED':
    case 'SUBSCRIPTION_STATE_PENDING':
      status = 'INACTIVE';
      break;
    default:
      status = 'CANCELED';
  }
  return {
    status,
    currentPeriodStart: new Date(sub.startTime ?? now.getTime()),
    currentPeriodEnd: end,
    cancelAtPeriodEnd: item?.autoRenewingPlan ? item.autoRenewingPlan.autoRenewEnabled === false : true,
  };
}

const oidcClient = new OAuth2Client();

/** Verify the OIDC token Pub/Sub attaches to push deliveries. */
export async function verifyPubSubPushToken(authorizationHeader: string | null): Promise<boolean> {
  const audience = process.env.GOOGLE_RTDN_AUDIENCE;
  if (!audience || !authorizationHeader?.startsWith('Bearer ')) return false;
  try {
    const ticket = await oidcClient.verifyIdToken({ idToken: authorizationHeader.slice(7), audience });
    const payload = ticket.getPayload();
    const expectedEmail = process.env.GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL;
    return Boolean(payload?.email_verified) && (!expectedEmail || payload?.email === expectedEmail);
  } catch {
    return false;
  }
}
