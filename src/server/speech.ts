/**
 * Speech I/O helpers: OpenAI speech-to-text and ElevenLabs (or OpenAI fallback) text-to-speech.
 * Both are called over plain REST so the server controls file names, mime types and streaming.
 */
import type { Persona } from './exam-engine';

const OPENAI_BASE = 'https://api.openai.com/v1';
export const STT_MODEL = process.env.OPENAI_STT_MODEL || 'gpt-4o-transcribe';
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

/**
 * Transcribe a Norwegian audio clip. Returns an empty string for silence.
 */
export async function transcribe(
  audio: Blob,
  mime: string | undefined,
  fileName?: string
): Promise<string> {
  if (!audio || audio.size < 256) {
    return '';
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const ext = extensionForMime(mime, fileName);
  const form = new FormData();
  form.append('file', new File([audio], `answer.${ext}`, { type: mime || `audio/${ext}` }));
  form.append('model', STT_MODEL);
  form.append('language', 'no');
  form.append(
    'prompt',
    'Muntlig norskprøve. Kandidaten snakker norsk bokmål, kanskje med aksent og grammatiske feil. Transkriber nøyaktig det som blir sagt, uten å rette feil.'
  );
  form.append('response_format', 'json');

  const res = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 400 && errText.includes('corrupted or unsupported')) {
      console.warn('[STT] Short or empty audio clip rejected by OpenAI; prompting candidate to retry.');
      return '';
    }
    throw new Error(`Transcription failed (${res.status}): ${errText}`);
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
 * Synthesize speech as an MP3 stream. Uses ElevenLabs when configured,
 * otherwise OpenAI gpt-4o-mini-tts.
 */
export async function synthesizeStream(
  text: string,
  persona: Persona
): Promise<ReadableStream<Uint8Array>> {
  const elevenKey = process.env.ELEVEN_API_KEY;
  const voiceId = voiceFor(persona);

  if (elevenKey && voiceId) {
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

