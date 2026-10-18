import { openai, createOpenAI } from '@ai-sdk/openai';
import { createAzure } from '@ai-sdk/azure';
import type { LanguageModel } from 'ai';

export type AiProviderType = 'openai' | 'azure';

/**
 * Returns the currently active AI provider type ('openai' or 'azure').
 * Defaults to 'openai' unless AI_PROVIDER=azure is explicitly configured.
 */
export function getActiveAiProvider(): AiProviderType {
  const provider = (process.env.AI_PROVIDER || 'openai').trim().toLowerCase();
  return provider === 'azure' ? 'azure' : 'openai';
}

/**
 * Checks if the active provider has credentials configured.
 */
export function isProviderConfigured(): boolean {
  const provider = getActiveAiProvider();
  if (provider === 'azure') {
    const key = process.env.AZURE_OPENAI_API_KEY;
    const resource = process.env.AZURE_OPENAI_RESOURCE_NAME || process.env.AZURE_OPENAI_ENDPOINT;
    return Boolean(key && resource && key.trim().length > 10);
  }

  const key = process.env.OPENAI_API_KEY;
  return Boolean(
    key &&
    key !== 'sk-xxxxxxx' &&
    !key.startsWith('sk-placeholder') &&
    key.trim().length > 15
  );
}

/**
 * Lazily creates the Azure OpenAI client instance.
 */
function getAzureClient() {
  const apiKey = process.env.AZURE_OPENAI_API_KEY || '';
  const resourceName = process.env.AZURE_OPENAI_RESOURCE_NAME;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION;

  if (endpoint) {
    // Custom endpoint / Azure AI Foundry project endpoint
    return createAzure({
      baseURL: endpoint.replace(/\/+$/, '') + (endpoint.includes('/openai') ? '' : '/openai'),
      apiKey,
      apiVersion,
    });
  }

  if (resourceName) {
    return createAzure({
      resourceName,
      apiKey,
      apiVersion,
    });
  }

  throw new Error(
    'Azure AI Foundry is selected (AI_PROVIDER=azure) but neither AZURE_OPENAI_RESOURCE_NAME nor AZURE_OPENAI_ENDPOINT is configured.'
  );
}

/**
 * Returns the model or deployment name string for the conversation LLM.
 */
export function getConversationModelName(): string {
  const provider = getActiveAiProvider();
  if (provider === 'azure') {
    return process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-4o-mini';
  }
  return process.env.OPENAI_CHAT_MODEL || 'gpt-4.1-mini';
}

/**
 * Returns the model or deployment name string for the evaluation LLM.
 */
export function getEvaluationModelName(): string {
  const provider = getActiveAiProvider();
  if (provider === 'azure') {
    return process.env.AZURE_OPENAI_EVAL_DEPLOYMENT || 'gpt-4o';
  }
  return process.env.OPENAI_EVAL_MODEL || 'gpt-4o';
}

/**
 * Returns the configured LanguageModel for real-time conversation turns (Sensor / Medkandidat).
 */
export function getConversationModel(): LanguageModel {
  const provider = getActiveAiProvider();

  if (provider === 'azure') {
    const azure = getAzureClient();
    const deployment = getConversationModelName();
    return azure(deployment);
  }

  const modelName = getConversationModelName();
  return openai(modelName);
}

/**
 * Returns the configured LanguageModel for structured rubric evaluation.
 */
export function getEvaluationModel(): LanguageModel {
  const provider = getActiveAiProvider();

  if (provider === 'azure') {
    const azure = getAzureClient();
    const deployment = process.env.AZURE_OPENAI_EVAL_DEPLOYMENT || 'gpt-4o';
    return azure(deployment);
  }

  const modelName = process.env.OPENAI_EVAL_MODEL || 'gpt-4o';
  return openai(modelName);
}

/**
 * Information needed to execute speech-to-text (Whisper).
 */
export interface SttEndpointConfig {
  provider: AiProviderType;
  url: string;
  headers: Record<string, string>;
  modelOrDeployment: string;
}

/**
 * Builds the STT endpoint URL, headers, and deployment/model parameters based on active provider.
 */
export function getSttEndpointConfig(): SttEndpointConfig {
  const provider = getActiveAiProvider();

  if (provider === 'azure') {
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    if (!apiKey) throw new Error('AZURE_OPENAI_API_KEY is not configured');

    const deployment = process.env.AZURE_OPENAI_WHISPER_DEPLOYMENT || 'whisper';
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';
    const resourceName = process.env.AZURE_OPENAI_RESOURCE_NAME;
    const customEndpoint = process.env.AZURE_OPENAI_ENDPOINT;

    let baseUrl: string;
    if (customEndpoint) {
      baseUrl = customEndpoint.replace(/\/+$/, '');
      if (!baseUrl.includes('/openai')) baseUrl += '/openai';
    } else if (resourceName) {
      baseUrl = `https://${resourceName}.openai.azure.com/openai`;
    } else {
      throw new Error(
        'AZURE_OPENAI_RESOURCE_NAME or AZURE_OPENAI_ENDPOINT must be set when AI_PROVIDER=azure'
      );
    }

    const url = `${baseUrl}/deployments/${encodeURIComponent(deployment)}/audio/transcriptions?api-version=${encodeURIComponent(apiVersion)}`;

    return {
      provider: 'azure',
      url,
      headers: {
        'api-key': apiKey,
      },
      modelOrDeployment: deployment,
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const model = process.env.OPENAI_STT_MODEL || 'gpt-4o-transcribe';
  return {
    provider: 'openai',
    url: 'https://api.openai.com/v1/audio/transcriptions',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    modelOrDeployment: model,
  };
}

/**
 * Information needed to execute Text-to-Speech (TTS).
 */
export interface AzureSpeechConfig {
  apiKey: string;
  region: string;
  endpoint?: string;
  examinerVoice: string;
  coCandidateVoice: string;
}

/**
 * Builds Azure AI Speech configuration for neural Norwegian voice synthesis.
 */
export function getAzureSpeechConfig(): AzureSpeechConfig {
  const apiKey = process.env.AZURE_SPEECH_KEY || process.env.AZURE_OPENAI_API_KEY;
  if (!apiKey) throw new Error('AZURE_SPEECH_KEY or AZURE_OPENAI_API_KEY is not configured');

  const region = process.env.AZURE_SPEECH_REGION || 'swedencentral';
  const endpoint = process.env.AZURE_SPEECH_ENDPOINT;
  const examinerVoice = process.env.AZURE_SPEECH_EXAMINER_VOICE || 'nb-NO-PernilleNeural';
  const coCandidateVoice = process.env.AZURE_SPEECH_COCANDIDATE_VOICE || 'nb-NO-FinnNeural';

  return {
    apiKey,
    region,
    endpoint,
    examinerVoice,
    coCandidateVoice,
  };
}
