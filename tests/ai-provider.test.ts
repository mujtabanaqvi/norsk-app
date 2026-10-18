import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getActiveAiProvider,
  isProviderConfigured,
  getConversationModel,
  getEvaluationModel,
  getSttEndpointConfig,
} from '../src/server/ai-provider';

test('AI Provider: defaults to openai when AI_PROVIDER is unset or empty', () => {
  const origProvider = process.env.AI_PROVIDER;
  delete process.env.AI_PROVIDER;

  assert.equal(getActiveAiProvider(), 'openai');

  const model = getConversationModel();
  assert.ok(model, 'Conversation model created for openai');

  const evalModel = getEvaluationModel();
  assert.ok(evalModel, 'Evaluation model created for openai');

  if (origProvider !== undefined) {
    process.env.AI_PROVIDER = origProvider;
  }
});

test('AI Provider: resolves Azure configuration when AI_PROVIDER=azure', () => {
  const origProvider = process.env.AI_PROVIDER;
  const origKey = process.env.AZURE_OPENAI_API_KEY;
  const origResource = process.env.AZURE_OPENAI_RESOURCE_NAME;
  const origChatDep = process.env.AZURE_OPENAI_CHAT_DEPLOYMENT;
  const origWhisperDep = process.env.AZURE_OPENAI_WHISPER_DEPLOYMENT;

  process.env.AI_PROVIDER = 'azure';
  process.env.AZURE_OPENAI_API_KEY = 'test-azure-key-1234567890';
  process.env.AZURE_OPENAI_RESOURCE_NAME = 'test-foundry-resource';
  process.env.AZURE_OPENAI_CHAT_DEPLOYMENT = 'custom-chat-dep';
  process.env.AZURE_OPENAI_WHISPER_DEPLOYMENT = 'custom-whisper-dep';

  assert.equal(getActiveAiProvider(), 'azure');
  assert.equal(isProviderConfigured(), true);

  const model = getConversationModel();
  assert.ok(model, 'Conversation model created for azure');

  const evalModel = getEvaluationModel();
  assert.ok(evalModel, 'Evaluation model created for azure');

  const sttConfig = getSttEndpointConfig();
  assert.equal(sttConfig.provider, 'azure');
  assert.equal(sttConfig.modelOrDeployment, 'custom-whisper-dep');
  assert.ok(
    sttConfig.url.includes('test-foundry-resource.openai.azure.com/openai/deployments/custom-whisper-dep/audio/transcriptions')
  );
  assert.equal(sttConfig.headers['api-key'], 'test-azure-key-1234567890');

  // Cleanup
  if (origProvider !== undefined) process.env.AI_PROVIDER = origProvider;
  else delete process.env.AI_PROVIDER;

  if (origKey !== undefined) process.env.AZURE_OPENAI_API_KEY = origKey;
  else delete process.env.AZURE_OPENAI_API_KEY;

  if (origResource !== undefined) process.env.AZURE_OPENAI_RESOURCE_NAME = origResource;
  else delete process.env.AZURE_OPENAI_RESOURCE_NAME;

  if (origChatDep !== undefined) process.env.AZURE_OPENAI_CHAT_DEPLOYMENT = origChatDep;
  else delete process.env.AZURE_OPENAI_CHAT_DEPLOYMENT;

  if (origWhisperDep !== undefined) process.env.AZURE_OPENAI_WHISPER_DEPLOYMENT = origWhisperDep;
  else delete process.env.AZURE_OPENAI_WHISPER_DEPLOYMENT;
});

test('AI Provider: STT endpoint configuration for direct openai', () => {
  const origProvider = process.env.AI_PROVIDER;
  const origKey = process.env.OPENAI_API_KEY;

  process.env.AI_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'sk-test-key-1234567890';

  const sttConfig = getSttEndpointConfig();
  assert.equal(sttConfig.provider, 'openai');
  assert.equal(sttConfig.url, 'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(sttConfig.headers['Authorization'], 'Bearer sk-test-key-1234567890');

  // Cleanup
  if (origProvider !== undefined) process.env.AI_PROVIDER = origProvider;
  else delete process.env.AI_PROVIDER;

  if (origKey !== undefined) process.env.OPENAI_API_KEY = origKey;
  else delete process.env.OPENAI_API_KEY;
});

