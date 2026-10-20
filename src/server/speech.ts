/**
 * Speech I/O helpers: speech-to-text (Azure AI Speech, Azure OpenAI Whisper or OpenAI) and
 * text-to-speech (Azure AI Speech, or ElevenLabs with OpenAI fallback).
 * Both are called over plain REST so the server controls file names, mime types and streaming.
 */
import type { Persona } from './exam-engine';
import {
  getSttEndpointConfig,
  getActiveAiProvider,
  getAzureSpeechConfig,
  getActiveSttProvider,
  getAzureSpeechSttConfig,
} from './ai-provider';

const OPENAI_BASE = 'https://api.openai.com/v1';
export const ELEVEN_MODEL = process.env.ELEVEN_MODEL_ID || 'eleven_multilingual_v2';

const MIME_EXT: Record<string, string> = {
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/aac': 'm4a',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/3gpp': '3gp',
};

export function extensionForMime(mime: string | undefined, fallbackName?: string): string {
  const base = (mime || '').split(';')[0].trim().toLowerCase();
  if (MIME_EXT[base]) return MIME_EXT[base];
  const fromName = fallbackName?.split('.').pop()?.toLowerCase();
  return fromName && fromName.length <= 4 ? fromName : 'm4a';
}

const RETRYABLE_STATUS = new Set([429, 503]);
const MAX_ATTEMPTS = 3;

/**
 * fetch() with exponential backoff (plus jitter) on 429/503, honouring Retry-After.
 * `buildInit` is called per attempt so multipart bodies are rebuilt fresh.
 */
export async function fetchWithRetry(
  url: string,
  buildInit: () => RequestInit,
  baseDelayMs = 500
): Promise<Response> {
  let res: Response | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    res = await fetch(url, buildInit());
    if (!RETRYABLE_STATUS.has(res.status) || attempt === MAX_ATTEMPTS) return res;

    const retryAfterSec = Number(res.headers.get('retry-after'));
    const delayMs =
      Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? Math.min(retryAfterSec * 1000, 10_000)
        : baseDelayMs * 2 ** (attempt - 1) + Math.random() * baseDelayMs;
    await res.body?.cancel().catch(() => {});
    console.warn(`[STT] ${res.status} from provider; retrying in ${Math.round(delayMs)}ms`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return res!;
}

/**
 * Transcribe a Norwegian audio clip. Returns an empty string for silence.
 * Routes by STT_PROVIDER: Azure AI Speech, Azure OpenAI Whisper, or OpenAI STT.
 */
export async function transcribe(
  audio: Blob,
  mime: string | undefined,
  fileName?: string
): Promise<string> {
  if (!audio || audio.size < 256) {
    return '';
  }

  if (getActiveSttProvider() === 'azure-speech') {
    return transcribeAzureSpeech(audio, mime, fileName);
  }
  return transcribeOpenAiCompatible(audio, mime, fileName);
}

/**
 * Azure AI Speech fast transcription (synchronous REST, 600 RPM default on S0).
 */
async function transcribeAzureSpeech(
  audio: Blob,
  mime: string | undefined,
  fileName?: string
): Promise<string> {
  const config = getAzureSpeechSttConfig();
  const ext = extensionForMime(mime, fileName);

  const res = await fetchWithRetry(config.url, () => {
    const form = new FormData();
    form.append('audio', new File([audio], `answer.${ext}`, { type: mime || `audio/${ext}` }));
    form.append(
      'definition',
      JSON.stringify({ locales: [config.locale], profanityFilterMode: 'None' })
    );
    return {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': config.apiKey },
      body: form,
    };
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 422 || (res.status === 400 && /audio|decod|format/i.test(errText))) {
      console.warn('[STT] Short or unreadable audio clip rejected by Azure Speech; prompting candidate to retry.');
      return '';
    }
    throw new Error(`[AZURE-SPEECH STT] Transcription failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { combinedPhrases?: Array<{ text?: string }> };
  return (data.combinedPhrases?.map((p) => p.text || '').join(' ') || '').trim();
}

/**
 * OpenAI-compatible /audio/transcriptions (OpenAI direct or Azure OpenAI Whisper deployment).
 */
async function transcribeOpenAiCompatible(
  audio: Blob,
  mime: string | undefined,
  fileName?: string
): Promise<string> {
  const endpointConfig = getSttEndpointConfig();
  const ext = extensionForMime(mime, fileName);

  const res = await fetchWithRetry(endpointConfig.url, () => {
    const form = new FormData();
    form.append('file', new File([audio], `answer.${ext}`, { type: mime || `audio/${ext}` }));
    form.append('model', endpointConfig.modelOrDeployment);
    form.append('language', 'no');
    form.append(
      'prompt',
      'Muntlig norskprøve. Kandidaten snakker norsk bokmål, kanskje med aksent og grammatiske feil. Transkriber nøyaktig det som blir sagt, uten å rette feil.'
    );
    form.append('response_format', 'json');
    return { method: 'POST', headers: endpointConfig.headers, body: form };
  });
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 400 && errText.includes('corrupted or unsupported')) {
      console.warn('[STT] Short or empty audio clip rejected by provider; prompting candidate to retry.');
      return '';
    }
    throw new Error(`[${endpointConfig.provider.toUpperCase()} STT] Transcription failed (${res.status}): ${errText}`);
  }
  const data = (await res.json()) as { text?: string };
  return (data.text || '').trim();
}

function voiceFor(persona: Persona): string | undefined {
  return persona === 'examiner'
    ? process.env.ELEVEN_EXAMINER_VOICE_ID
    : process.env.ELEVEN_COCANDIDATE_VOICE_ID;
}

/**
 * Synthesize speech using Azure AI Speech (Neural Norwegian voices).
 * Strictly used when AI_PROVIDER=azure with zero calls to OpenAI or ElevenLabs.
 */
async function synthesizeAzureStream(
  text: string,
  persona: Persona
): Promise<ReadableStream<Uint8Array>> {
  const config = getAzureSpeechConfig();
  const voiceName = persona === 'examiner' ? config.examinerVoice : config.coCandidateVoice;
  const endpoint = config.ttsUrl;

  // Escape XML characters for SSML safety
  const safeText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const ssml = `<speak version="1.0" xml:lang="nb-NO"><voice xml:lang="nb-NO" name="${voiceName}">${safeText}</voice></speak>`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': config.apiKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
      'User-Agent': 'norsk-app-control-plane',
    },
    body: ssml,
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    throw new Error(`[Azure TTS] Speech synthesis failed (${res.status}): ${errText}`);
  }

  return res.body;
}

/**
 * Synthesize speech as an MP3 stream with strict provider isolation:
 * - When AI_PROVIDER=azure: Strictly Azure AI Speech (no fallback to ElevenLabs or OpenAI).
 * - When AI_PROVIDER=openai: ElevenLabs with fallback to OpenAI direct TTS.
 */
export async function synthesizeStream(
  text: string,
  persona: Persona
): Promise<ReadableStream<Uint8Array>> {
  const provider = getActiveAiProvider();

  // 1. Strict Azure Route (100% Azure AI Foundry, zero fallback)
  if (provider === 'azure') {
    return synthesizeAzureStream(text, persona);
  }

  // 2. OpenAI Route (ElevenLabs primary with OpenAI TTS fallback)
  const elevenKey = process.env.ELEVEN_API_KEY;
  const voiceId = voiceFor(persona);

  if (elevenKey && voiceId) {
    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': elevenKey,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text,
            model_id: ELEVEN_MODEL,
            language_code:
              ELEVEN_MODEL.includes('v2_5') || ELEVEN_MODEL.includes('v3') ? 'no' : undefined,
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        }
      );
      if (res.ok && res.body) return res.body;
      console.warn(
        `[TTS] ElevenLabs failed (${res.status}); falling back to OpenAI TTS:`,
        await res.text().catch(() => '')
      );
    } catch (err) {
      console.warn('[TTS] ElevenLabs network error; falling back to OpenAI TTS:', err);
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('No TTS provider configured (ELEVEN_API_KEY or OPENAI_API_KEY)');
  const res = await fetch(`${OPENAI_BASE}/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: persona === 'examiner' ? 'onyx' : 'nova',
      input: text,
      instructions:
        persona === 'examiner'
          ? 'Snakk tydelig, rolig og vennlig på norsk bokmål, som en profesjonell sensor.'
          : 'Snakk naturlig og engasjert på norsk bokmål, som en medkandidat på en muntlig prøve.',
      response_format: 'mp3',
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`OpenAI TTS failed (${res.status}): ${await res.text().catch(() => '')}`);
  }
  return res.body;
}

