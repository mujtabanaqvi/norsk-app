import { Platform } from 'react-native';
import { API_BASE_URL, getCandidateApiBaseUrls } from './config';
import { getOrCreateUserId, getAuthToken, setAuthToken, setStoredUser, clearAuthSession } from './identity';
import type {
  CefrLevel,
  CoCandidateMode,
  ExamResultsResponse,
  FinishExamResponse,
  GetTopicsResponse,
  StartExamResponse,
  TurnResponse,
} from './types/exam';

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
        throw new Error(`Feil ved klargjøring av lyddata på enheten: ${errMsg}`);
      }
    }
  }

  const triedList = triedUrls.join(', ');
  if (
    lastError instanceof Error &&
    (lastError.name === 'AbortError' || lastError.message.includes('aborted'))
  ) {
    throw new Error(
      `Tidsavbrudd ved tilkobling til serveren (${triedList}). Sjekk at Next.js-serveren kjører (npm run dev).`
    );
  }

  throw new Error(
    `Kunne ikke koble til serveren (${triedList}). Sjekk at PC og telefon er på samme Wi-Fi og at npm run dev kjører.`
  );
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
    throw new Error(`Kunne ikke lese lydfil (${fileRes.status})`);
  }
  const buffer = await fileRes.arrayBuffer();
  return new Uint8Array(buffer);
}

export function resolveAudioUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return '';
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }
  return `${activeApiBaseUrl}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
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
    throw new Error(body.message || body.error || `Kunne ikke hente temaer (${res.status})`);
  }

  return res.json();
}

export async function startExamSession(params: {
  topicId?: string;
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
      topicId: params.topicId || 'RANDOM',
      level: params.level,
      coCandidateMode: params.coCandidateMode,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.message || body.error || `Kunne ikke starte muntlig prøve (${res.status})`
    );
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
      throw new Error(body.message || body.error || `Feil ved innsending (${res.status})`);
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
    throw new Error(
      body.message || body.error || `Kunne ikke sende lydopptak (${res.status})`
    );
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
    throw new Error(body.message || body.error || `Kunne ikke avslutte prøve (${res.status})`);
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
      throw new Error('Eksamensesjonen ble ikke funnet.');
    }
    throw new Error(`Kunne ikke hente resultat (${res.status})`);
  }

  return res.json();
}

/**
 * Authentication & Subscription API methods
 */

export async function registerWithEmail(params: {
  email: string;
  password: string;
  name?: string;
  referralCode?: string;
}) {
  const res = await fetchWithTimeout(`${activeApiBaseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Registrering mislyktes');
  }
  if (data.token) {
    await setAuthToken(data.token);
    await setStoredUser(data.user);
  }
  return data;
}

export async function loginWithEmail(params: { email: string; password: string }) {
  const res = await fetchWithTimeout(`${activeApiBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Innlogging mislyktes');
  }
  if (data.token) {
    await setAuthToken(data.token);
    await setStoredUser(data.user);
  }
  return data;
}

export async function loginWithGoogleToken(idToken: string, referralCode?: string) {
  const res = await fetchWithTimeout(`${activeApiBaseUrl}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, referralCode }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Google-innlogging mislyktes');
  }
  if (data.token) {
    await setAuthToken(data.token);
    await setStoredUser(data.user);
  }
  return data;
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
    throw new Error('Kunne ikke hente brukerprofil');
  }
  return res.json();
}

export async function fetchTierConfigs() {
  const res = await fetchWithTimeout(`${activeApiBaseUrl}/api/config/tiers`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error('Kunne ikke hente abonnementsplaner');
  }
  return res.json();
}

export async function fetchReferrals() {
  const res = await fetchWithTimeout(`${activeApiBaseUrl}/api/referrals`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error('Kunne ikke hente vervekode');
  }
  return res.json();
}

export async function createStripeCheckout(tier: 'STANDARD' | 'PREMIUM', successUrl?: string, cancelUrl?: string) {
  const res = await fetchWithTimeout(`${activeApiBaseUrl}/api/stripe/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier, successUrl, cancelUrl }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Kunne ikke starte betaling');
  }
  return data;
}



