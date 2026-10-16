import { Platform } from 'react-native';
import { API_BASE_URL } from './config';
import { getOrCreateUserId } from './identity';
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

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(
        `Tidsavbrudd ved tilkobling til serveren (${API_BASE_URL}). Sjekk at Next.js-serveren kjører (npm run dev).`
      );
    }
    throw new Error(
      `Kunne ikke koble til serveren (${API_BASE_URL}). Sjekk at PC og telefon er på samme Wi-Fi og at npm run dev kjører.`
    );
  } finally {
    clearTimeout(timer);
  }
}

export function resolveAudioUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return '';
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }
  return `${API_BASE_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

export async function fetchTopicsAndQuota(): Promise<GetTopicsResponse> {
  const userId = await getOrCreateUserId();
  const endpoint = `${API_BASE_URL}/api/exam/topics?userId=${encodeURIComponent(userId)}`;

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
  topicId: string;
  level: CefrLevel;
  coCandidateMode: CoCandidateMode;
}): Promise<StartExamResponse> {
  const userId = await getOrCreateUserId();
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/exam/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-user-id': userId,
    },
    body: JSON.stringify({
      userId,
      topicId: params.topicId,
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
  const endpoint = `${API_BASE_URL}/api/exam/${encodeURIComponent(sessionId)}/turn`;

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

    // React Native FormData file object convention
    form.append('audio', {
      uri,
      name: `answer.${ext}`,
      type: mime,
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
    `${API_BASE_URL}/api/exam/${encodeURIComponent(sessionId)}/finish`,
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
    `${API_BASE_URL}/api/exam/${encodeURIComponent(sessionId)}/results`,
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

