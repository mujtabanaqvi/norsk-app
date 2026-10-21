import { Platform } from 'react-native';
import { API_BASE_URL, getCandidateApiBaseUrls } from './config';
import { getOrCreateUserId, getAuthToken, setAuthToken, setStoredUser, clearAuthSession } from './identity';
import {
  DEFAULT_LOCALE,
  getCurrentLocale,
  hasTranslation,
  translate,
  type TranslationKey,
  type TranslationParams,
} from './i18n';
import type {
  CefrLevel,
  CoCandidateMode,
  ExamResultsResponse,
  FinishExamResponse,
  GetTopicsResponse,
  StartExamResponse,
  TurnResponse,
} from './types/exam';
import type { LearningProfileResponse } from './types/learning-profile';

/** Client-side messages follow the UI language chosen in the app. */
const tr = (key: TranslationKey, params?: TranslationParams) =>
  translate(getCurrentLocale(), key, params);

const DEFAULT_TIMEOUT_MS = 35_000;
const FALLBACK_PROBE_TIMEOUT_MS = 6_000;

const CANDIDATE_BASE_URLS = getCandidateApiBaseUrls({
  envUrl: process.env.EXPO_PUBLIC_API_URL || process.env.REACT_NATIVE_API_URL,
});

let activeApiBaseUrl: string = API_BASE_URL;

export function getActiveApiBaseUrl(): string {
  return activeApiBaseUrl;
}

function buildUrlForBase(pathOrUrl: string, baseUrl: string): string {
  for (const candidate of CANDIDATE_BASE_URLS) {
    if (pathOrUrl.startsWith(candidate)) {
      return `${baseUrl}${pathOrUrl.slice(candidate.length)}`;
    }
  }
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }
  return `${baseUrl}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

async function fetchSingleAttempt(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const token = await getAuthToken();
  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const modifiedInit = { ...init, headers };
  const orderedBases = [
    activeApiBaseUrl,
    ...CANDIDATE_BASE_URLS.filter((b) => b !== activeApiBaseUrl),
  ];

  let lastError: unknown = null;
  const triedUrls: string[] = [];

  for (let i = 0; i < orderedBases.length; i++) {
    const base = orderedBases[i];
    const targetUrl = buildUrlForBase(url, base);
    triedUrls.push(base);

    // Use full timeout for primary base URL, or when only 1 base exists
    const attemptTimeout =
      i === 0 ? timeoutMs : Math.min(timeoutMs, FALLBACK_PROBE_TIMEOUT_MS);

    try {
      const res = await fetchSingleAttempt(targetUrl, modifiedInit, attemptTimeout);
      activeApiBaseUrl = base;
      return res;
    } catch (err) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      // Do not mask or retry client-side FormData/Body serialization errors as network errors
      if (
        errMsg.includes('Unsupported FormDataPart') ||
        errMsg.includes('Unsupported BodyInit')
      ) {
        throw new Error(tr('network.prepareAudio', { error: errMsg }));
      }
    }
  }

  const triedList = triedUrls.join(', ');
  if (
    lastError instanceof Error &&
    (lastError.name === 'AbortError' || lastError.message.includes('aborted'))
  ) {
    throw new Error(tr('network.timeout', { urls: triedList }));
  }

  throw new Error(tr('network.connectFailed', { urls: triedList }));
}

/**
 * Read local recorded audio file into a Uint8Array on React Native (Android / iOS).
 * Expo SDK 57 replaces global.fetch with expo/fetch, whose FormData serializer
 * requires a Blob or an object with a `.bytes()` method rather than `{ uri, name, type }` alone.
 */
async function readNativeAudioBytes(uri: string): Promise<Uint8Array> {
  try {
    const { File: ExpoFile } = await import('expo-file-system');
    const file = new ExpoFile(uri);
    const bytes = await file.bytes();
    if (bytes && bytes.byteLength > 0) {
      return bytes;
    }
  } catch {
    // Fall back to fetching the file:// URI directly via ExpoFetchModule's file interceptor
  }

  const fileRes = await fetch(uri);
  if (!fileRes.ok) {
    throw new Error(tr('network.readAudio', { status: fileRes.status }));
  }
  const buffer = await fileRes.arrayBuffer();
  return new Uint8Array(buffer);
}

export function resolveAudioUrl(pathOrUrl: string, token?: string | null): string {
  if (!pathOrUrl) return '';
  let fullUrl = pathOrUrl;
  if (!pathOrUrl.startsWith('http://') && !pathOrUrl.startsWith('https://')) {
    fullUrl = `${activeApiBaseUrl}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
  }

  if (token && !fullUrl.includes('token=')) {
    const separator = fullUrl.includes('?') ? '&' : '?';
    fullUrl = `${fullUrl}${separator}token=${encodeURIComponent(token)}`;
  }
  return fullUrl;
}

export async function fetchTopicsAndQuota(): Promise<GetTopicsResponse> {
  const userId = await getOrCreateUserId();
  const endpoint = `${activeApiBaseUrl}/api/exam/topics?userId=${encodeURIComponent(userId)}`;

  const res = await fetchWithTimeout(endpoint, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'x-user-id': userId,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || tr('network.fetchTopics', { status: res.status }));
  }

  return res.json();
}

export async function startExamSession(params: {
  themeId?: string;
  level: CefrLevel;
  coCandidateMode: CoCandidateMode;
}): Promise<StartExamResponse> {
  const userId = await getOrCreateUserId();
  const res = await fetchWithTimeout(`${activeApiBaseUrl}/api/exam/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-user-id': userId,
    },
    body: JSON.stringify({
      userId,
      themeId: params.themeId || 'RANDOM',
      level: params.level,
      coCandidateMode: params.coCandidateMode,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || tr('network.startExam', { status: res.status }));
  }

  return res.json();
}

export interface SubmitTurnOptions {
  audioUri?: string | null;
  durationMs?: number;
  speaker?: 'CANDIDATE_1' | 'CANDIDATE_2';
  endDiscussion?: boolean;
  textOverride?: string;
}

export async function submitExamTurn(
  sessionId: string,
  options: SubmitTurnOptions
): Promise<TurnResponse> {
  const userId = await getOrCreateUserId();
  const endpoint = `${activeApiBaseUrl}/api/exam/${encodeURIComponent(sessionId)}/turn`;

  // If no audio file is being uploaded (e.g., ending HUMAN_LOCAL discussion or textOverride)
  if (!options.audioUri) {
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({
        durationMs: options.durationMs ?? 0,
        speaker: options.speaker ?? 'CANDIDATE_1',
        endDiscussion: Boolean(options.endDiscussion),
        textOverride: options.textOverride,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || body.error || tr('network.submitTurn', { status: res.status }));
    }
    return res.json();
  }

  const form = new FormData();
  form.append('durationMs', String(Math.round(options.durationMs ?? 0)));
  form.append('speaker', options.speaker ?? 'CANDIDATE_1');
  if (options.endDiscussion) {
    form.append('endDiscussion', 'true');
  }

  if (Platform.OS === 'web') {
    const blobRes = await fetch(options.audioUri);
    const blob = await blobRes.blob();
    const ext = blob.type.includes('mp4') || blob.type.includes('m4a') ? 'm4a' : 'webm';
    form.append('audio', blob, `answer.${ext}`);
  } else {
    const uri = options.audioUri;
    const ext = uri.split('.').pop()?.toLowerCase() || 'm4a';
    const mime =
      ext === '3gp'
        ? 'audio/3gpp'
        : ext === 'wav'
          ? 'audio/wav'
          : ext === 'webm'
            ? 'audio/webm'
            : 'audio/m4a';

    const audioBytes = await readNativeAudioBytes(uri);

    // Compatible with both Expo SDK 57 expo/fetch (uses .bytes(), .name, .type)
    // and legacy React Native XMLHttpRequest FormData (uses .uri, .name, .type)
    form.append('audio', {
      uri,
      name: `answer.${ext}`,
      type: mime,
      bytes: async () => audioBytes,
    } as unknown as Blob);
  }

  const res = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'x-user-id': userId,
      },
      body: form,
    },
    45_000
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || tr('network.uploadAudio', { status: res.status }));
  }

  return res.json();
}

export async function finishExamSession(sessionId: string): Promise<FinishExamResponse> {
  const userId = await getOrCreateUserId();
  const res = await fetchWithTimeout(
    `${activeApiBaseUrl}/api/exam/${encodeURIComponent(sessionId)}/finish`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'x-user-id': userId,
      },
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || tr('network.finishExam', { status: res.status }));
  }

  return res.json();
}

export async function fetchExamResults(sessionId: string): Promise<ExamResultsResponse> {
  const userId = await getOrCreateUserId();
  const res = await fetchWithTimeout(
    `${activeApiBaseUrl}/api/exam/${encodeURIComponent(sessionId)}/results`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-user-id': userId,
      },
    }
  );

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(tr('network.sessionNotFound'));
    }
    throw new Error(tr('network.fetchResult', { status: res.status }));
  }

  return res.json();
}

/**
 * Authentication & Subscription API methods
 */

export class ApiError extends Error {
  status: number;
  code?: string;
  fieldErrors?: Record<string, string>;
  email?: string;
  retryAfterSeconds?: number;

  constructor(status: number, data: any, fallbackMessage: string) {
    const localized = localizedApiMessage(data);
    super(localized || data?.message || fallbackMessage);
    this.name = 'ApiError';
    this.status = status;
    this.code = data?.error;
    // Server field errors for a known code carry the same message, so swap in the translation.
    this.fieldErrors =
      localized && data?.fieldErrors
        ? Object.fromEntries(Object.keys(data.fieldErrors).map((field) => [field, localized]))
        : data?.fieldErrors;
    this.email = data?.email;
    this.retryAfterSeconds = data?.retryAfterSeconds;
  }
}

/**
 * The API answers in Norwegian; for another UI language, translate known error codes
 * (`apiErrors.<CODE>`). Unknown codes keep the server's Norwegian message.
 */
function localizedApiMessage(data: any): string | null {
  const locale = getCurrentLocale();
  const key = `apiErrors.${data?.error}`;
  if (locale === DEFAULT_LOCALE || !data?.error || !hasTranslation(key)) return null;
  return translate(locale, key, { seconds: data?.retryAfterSeconds ?? '' });
}

async function postAuthJson(path: string, payload: unknown, fallbackMessage: string) {
  const res = await fetchWithTimeout(`${activeApiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data, fallbackMessage);
  }
  if (data.token) {
    await setAuthToken(data.token);
    await setStoredUser(data.user);
  }
  return data;
}

export interface RegisterResult {
  requiresVerification: true;
  email: string;
  retryAfterSeconds?: number;
}

export async function registerWithEmail(params: {
  email: string;
  password: string;
  confirmPassword: string;
  name: string;
  referralCode?: string;
}): Promise<RegisterResult> {
  return postAuthJson('/api/auth/register', params, tr('network.registerFailed'));
}

export async function loginWithEmail(params: { email: string; password: string }) {
  return postAuthJson('/api/auth/login', params, tr('network.loginFailed'));
}

export async function verifyEmailCode(email: string, code: string) {
  return postAuthJson('/api/auth/verify-email', { email, code }, tr('network.verifyFailed'));
}

export async function resendVerificationEmail(email: string): Promise<{ retryAfterSeconds?: number }> {
  return postAuthJson('/api/auth/resend-verification', { email }, tr('network.resendFailed'));
}

export async function loginWithGoogleToken(idToken: string, referralCode?: string) {
  return postAuthJson('/api/auth/google', { idToken, referralCode }, tr('network.googleFailed'));
}

export async function logoutUser() {
  await clearAuthSession();
}

export async function fetchCurrentUser() {
  const res = await fetchWithTimeout(`${activeApiBaseUrl}/api/auth/me`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    if (res.status === 401) {
      await clearAuthSession();
      return null;
    }
    throw new Error(tr('network.fetchProfile'));
  }
  return res.json();
}

export async function fetchLearningProfile(refresh = false): Promise<LearningProfileResponse> {
  const res = await fetchWithTimeout(
    `${activeApiBaseUrl}/api/learning-profile${refresh ? '?refresh=1' : ''}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
    },
    // Regenerating the coach summary calls the LLM
    refresh ? 60_000 : DEFAULT_TIMEOUT_MS
  );
  if (!res.ok) {
    throw new Error(tr('network.fetchLearningProfile', { status: res.status }));
  }
  return res.json();
}

export async function fetchTierConfigs() {
  const res = await fetchWithTimeout(`${activeApiBaseUrl}/api/config/tiers`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(tr('network.fetchPlans'));
  }
  return res.json();
}

export async function fetchReferrals() {
  const res = await fetchWithTimeout(`${activeApiBaseUrl}/api/referrals`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(tr('network.fetchReferral'));
  }
  return res.json();
}

export async function createStripeCheckout(tier: 'STANDARD' | 'PREMIUM', successUrl?: string, cancelUrl?: string) {
  const res = await fetchWithTimeout(`${activeApiBaseUrl}/api/stripe/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier, successUrl, cancelUrl, locale: getCurrentLocale() }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || tr('network.checkout'));
  }
  return data;
}

export type PaidTierResult = { tier: 'FREE' | 'STANDARD' | 'PREMIUM' };

/** Error from a purchase verification call, with the server's machine-readable code (e.g. OWNED_BY_OTHER_ACCOUNT). */
export class PurchaseVerificationError extends Error {
  constructor(message: string, public code?: string, public status?: number) {
    super(message);
    this.name = 'PurchaseVerificationError';
  }
}

async function postPurchaseVerification(path: string, body: object): Promise<PaidTierResult> {
  const res = await fetchWithTimeout(`${activeApiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new PurchaseVerificationError(data.message || tr('network.verifyPurchase'), data.code, res.status);
  }
  return data;
}

/** iOS: send the StoreKit 2 JWS transaction for server-side verification. */
export function verifyApplePurchase(signedTransaction: string) {
  return postPurchaseVerification('/api/iap/apple/verify', { signedTransaction });
}

/** Android: send the Play purchase token for server-side verification and acknowledgement. */
export function verifyGooglePurchase(purchaseToken: string) {
  return postPurchaseVerification('/api/iap/google/verify', { purchaseToken });
}

/** Web: look up (and fulfil, if paid) the Stripe Checkout session we were redirected back from. */
export async function fetchCheckoutSession(
  sessionId: string
): Promise<{ status: 'paid' | 'pending' | 'expired'; tier: 'FREE' | 'STANDARD' | 'PREMIUM' | null }> {
  const res = await fetchWithTimeout(
    `${activeApiBaseUrl}/api/stripe/checkout/session?session_id=${encodeURIComponent(sessionId)}`,
    { method: 'GET', headers: { Accept: 'application/json' } }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || tr('network.checkoutSession'));
  }
  return data;
}
