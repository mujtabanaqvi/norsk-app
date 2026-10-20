import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getActiveSttProvider,
  getAzureSpeechBase,
  getAzureSpeechConfig,
  getAzureSpeechSttConfig,
  getSttEndpointConfig,
} from '../src/server/ai-provider';
import { transcribe } from '../src/server/speech';

const ENV_KEYS = [
  'AI_PROVIDER',
  'STT_PROVIDER',
  'AZURE_SPEECH_KEY',
  'AZURE_SPEECH_REGION',
  'AZURE_SPEECH_ENDPOINT',
  'AZURE_SPEECH_STT_ENDPOINT',
  'AZURE_SPEECH_STT_LOCALE',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_RESOURCE_NAME',
  'AZURE_OPENAI_ENDPOINT',
] as const;

function withEnv(vars: Partial<Record<(typeof ENV_KEYS)[number], string>>, fn: () => Promise<void> | void) {
  return async () => {
    const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
    Object.assign(process.env, vars);
    try {
      await fn();
    } finally {
      for (const k of ENV_KEYS) {
        if (saved[k] !== undefined) process.env[k] = saved[k];
        else delete process.env[k];
      }
    }
  };
}

function mockFetch(responses: Array<() => Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const orig = globalThis.fetch;
  let i = 0;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return responses[Math.min(i++, responses.length - 1)]();
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = orig) };
}

const audio = () => new Blob([new Uint8Array(1024)], { type: 'audio/webm' });

test(
  'STT Provider: unset STT_PROVIDER follows AI_PROVIDER (back-compat)',
  withEnv({ AI_PROVIDER: 'azure' }, () => {
    assert.equal(getActiveSttProvider(), 'azure-openai');
    process.env.AI_PROVIDER = 'openai';
    assert.equal(getActiveSttProvider(), 'openai');
  })
);

test(
  'STT Provider: STT_PROVIDER overrides AI_PROVIDER',
  withEnv({ AI_PROVIDER: 'azure', STT_PROVIDER: 'azure-speech' }, () => {
    assert.equal(getActiveSttProvider(), 'azure-speech');
    process.env.STT_PROVIDER = 'openai';
    assert.equal(getActiveSttProvider(), 'openai');
    process.env.STT_PROVIDER = 'bogus';
    assert.equal(getActiveSttProvider(), 'azure-openai');
  })
);

test(
  'STT Provider: STT_PROVIDER=openai uses OpenAI endpoint even when AI_PROVIDER=azure',
  withEnv({ AI_PROVIDER: 'azure', STT_PROVIDER: 'openai' }, () => {
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-test-key-1234567890';
    assert.equal(getSttEndpointConfig().provider, 'openai');
  })
);

test(
  'Azure Speech STT: regional URL, key fallback and default nb-NO locale',
  withEnv({ STT_PROVIDER: 'azure-speech', AZURE_OPENAI_API_KEY: 'foundry-key', AZURE_SPEECH_REGION: 'norwayeast' }, () => {
    const cfg = getAzureSpeechSttConfig();
    assert.equal(
      cfg.url,
      'https://norwayeast.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15'
    );
    assert.equal(cfg.apiKey, 'foundry-key');
    assert.equal(cfg.locale, 'nb-NO');
  })
);

test(
  'Azure Speech: Foundry resource name → STT and TTS on resource endpoint, no region needed',
  withEnv({ AZURE_OPENAI_API_KEY: 'foundry-key', AZURE_OPENAI_RESOURCE_NAME: 'my-foundry' }, () => {
    assert.deepEqual(getAzureSpeechBase(), {
      kind: 'resource',
      baseUrl: 'https://my-foundry.cognitiveservices.azure.com',
    });
    assert.equal(
      getAzureSpeechSttConfig().url,
      'https://my-foundry.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15'
    );
    assert.equal(
      getAzureSpeechConfig().ttsUrl,
      'https://my-foundry.cognitiveservices.azure.com/tts/cognitiveservices/v1'
    );
  })
);

test(
  'Azure Speech: resource name derived from AZURE_OPENAI_ENDPOINT',
  withEnv({ AZURE_OPENAI_API_KEY: 'foundry-key', AZURE_OPENAI_ENDPOINT: 'https://foo.openai.azure.com/' }, () => {
    assert.deepEqual(getAzureSpeechBase(), {
      kind: 'resource',
      baseUrl: 'https://foo.cognitiveservices.azure.com',
    });
  })
);

test(
  'Azure Speech: explicit AZURE_SPEECH_REGION keeps regional endpoints (back-compat)',
  withEnv(
    { AZURE_OPENAI_API_KEY: 'foundry-key', AZURE_OPENAI_RESOURCE_NAME: 'my-foundry', AZURE_SPEECH_REGION: 'norwayeast' },
    () => {
      assert.equal(
        getAzureSpeechConfig().ttsUrl,
        'https://norwayeast.tts.speech.microsoft.com/cognitiveservices/v1'
      );
      assert.ok(getAzureSpeechSttConfig().url.startsWith('https://norwayeast.api.cognitive.microsoft.com/'));
    }
  )
);

test(
  'Azure Speech: dedicated AZURE_SPEECH_KEY without region uses swedencentral, not the Foundry domain',
  withEnv({ AZURE_SPEECH_KEY: 'speech-key', AZURE_OPENAI_RESOURCE_NAME: 'my-foundry' }, () => {
    assert.deepEqual(getAzureSpeechBase(), { kind: 'region', region: 'swedencentral' });
    assert.equal(
      getAzureSpeechConfig().ttsUrl,
      'https://swedencentral.tts.speech.microsoft.com/cognitiveservices/v1'
    );
  })
);

test(
  'Azure Speech: AZURE_SPEECH_ENDPOINT overrides TTS URL',
  withEnv(
    { AZURE_OPENAI_API_KEY: 'foundry-key', AZURE_OPENAI_RESOURCE_NAME: 'my-foundry', AZURE_SPEECH_ENDPOINT: 'https://custom/tts' },
    () => {
      assert.equal(getAzureSpeechConfig().ttsUrl, 'https://custom/tts');
    }
  )
);

test(
  'Azure Speech STT: custom endpoint and dedicated key take precedence',
  withEnv(
    {
      AZURE_SPEECH_KEY: 'speech-key',
      AZURE_OPENAI_API_KEY: 'foundry-key',
      AZURE_SPEECH_STT_ENDPOINT: 'https://my-foundry.cognitiveservices.azure.com/',
    },
    () => {
      const cfg = getAzureSpeechSttConfig();
      assert.ok(cfg.url.startsWith('https://my-foundry.cognitiveservices.azure.com/speechtotext/'));
      assert.equal(cfg.apiKey, 'speech-key');
    }
  )
);

test(
  'Azure Speech STT: transcribe() sends audio + definition and parses combinedPhrases',
  withEnv({ STT_PROVIDER: 'azure-speech', AZURE_SPEECH_KEY: 'speech-key' }, async () => {
    const m = mockFetch([
      () => Response.json({ combinedPhrases: [{ text: ' Jeg bor i Oslo. ' }], phrases: [] }),
    ]);
    try {
      const text = await transcribe(audio(), 'audio/webm');
      assert.equal(text, 'Jeg bor i Oslo.');
      assert.equal(m.calls.length, 1);
      const init = m.calls[0].init!;
      assert.equal((init.headers as Record<string, string>)['Ocp-Apim-Subscription-Key'], 'speech-key');
      const form = init.body as FormData;
      assert.ok(form.get('audio') instanceof Blob);
      assert.deepEqual(JSON.parse(String(form.get('definition'))), {
        locales: ['nb-NO'],
        profanityFilterMode: 'None',
      });
    } finally {
      m.restore();
    }
  })
);

test(
  'Azure Speech STT: empty combinedPhrases returns empty string (silence)',
  withEnv({ STT_PROVIDER: 'azure-speech', AZURE_SPEECH_KEY: 'speech-key' }, async () => {
    const m = mockFetch([() => Response.json({ combinedPhrases: [], phrases: [] })]);
    try {
      assert.equal(await transcribe(audio(), 'audio/webm'), '');
    } finally {
      m.restore();
    }
  })
);

test(
  'STT: retries on 429 then succeeds',
  withEnv({ STT_PROVIDER: 'azure-speech', AZURE_SPEECH_KEY: 'speech-key' }, async () => {
    const m = mockFetch([
      () => new Response('throttled', { status: 429, headers: { 'retry-after': '0.01' } }),
      () => Response.json({ combinedPhrases: [{ text: 'Hei' }] }),
    ]);
    try {
      assert.equal(await transcribe(audio(), 'audio/webm'), 'Hei');
      assert.equal(m.calls.length, 2);
    } finally {
      m.restore();
    }
  })
);
