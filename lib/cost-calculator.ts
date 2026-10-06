export interface UsageInput {
  llmPromptTokens: number;
  llmCompletionTokens: number;
  ttsCharacters: number;
  sttAudioSeconds: number;
}

export interface CostBreakdown {
  llmPromptCostUsd: number;
  llmCompletionCostUsd: number;
  totalLlmCostUsd: number;
  ttsCostUsd: number;
  sttCostUsd: number;
  totalEstimatedCostUsd: number;
  totalEstimatedCostUsdFormatted: string; // Formatted to 6 decimal places for numeric(12,6)
}

// Current provider unit rates
export const PRICING_RATES = {
  // OpenAI GPT-4.1-mini ($0.15 / 1M prompt tokens, $0.60 / 1M completion tokens)
  OPENAI_GPT_4_1_MINI_PROMPT_PER_TOKEN: 0.15 / 1_000_000,
  OPENAI_GPT_4_1_MINI_COMPLETION_PER_TOKEN: 0.60 / 1_000_000,

  // ElevenLabs Flash v2.5 ($0.075 / 1,000 characters)
  ELEVENLABS_FLASH_V2_5_PER_CHARACTER: 0.075 / 1_000,

  // Deepgram Nova-3 ($0.0043 / audio minute => $0.0043 / 60 per second)
  DEEPGRAM_NOVA_3_PER_SECOND: 0.0043 / 60,
};

/**
 * Calculates estimated USD cost for an exam session across LLM, TTS, and STT providers.
 */
export function calculateEstimatedCostUsd(usage: UsageInput): CostBreakdown {
  const promptTokens = Math.max(0, usage.llmPromptTokens || 0);
  const completionTokens = Math.max(0, usage.llmCompletionTokens || 0);
  const ttsChars = Math.max(0, usage.ttsCharacters || 0);
  const audioSeconds = Math.max(0, usage.sttAudioSeconds || 0);

  const llmPromptCostUsd = promptTokens * PRICING_RATES.OPENAI_GPT_4_1_MINI_PROMPT_PER_TOKEN;
  const llmCompletionCostUsd =
    completionTokens * PRICING_RATES.OPENAI_GPT_4_1_MINI_COMPLETION_PER_TOKEN;
  const totalLlmCostUsd = llmPromptCostUsd + llmCompletionCostUsd;

  const ttsCostUsd = ttsChars * PRICING_RATES.ELEVENLABS_FLASH_V2_5_PER_CHARACTER;
  const sttCostUsd = audioSeconds * PRICING_RATES.DEEPGRAM_NOVA_3_PER_SECOND;

  const totalEstimatedCostUsd = totalLlmCostUsd + ttsCostUsd + sttCostUsd;

  return {
    llmPromptCostUsd,
    llmCompletionCostUsd,
    totalLlmCostUsd,
    ttsCostUsd,
    sttCostUsd,
    totalEstimatedCostUsd,
    totalEstimatedCostUsdFormatted: totalEstimatedCostUsd.toFixed(6),
  };
}

