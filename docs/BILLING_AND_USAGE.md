# Billing, Costs & Quota Ledger

This document details how the control plane computes AI provider costs, enforces oral practice limits, and guarantees financial data integrity using atomic transactions.

---

## 1. Provider Pricing Rates

Infrastructure cost estimation is computed using standard unit prices across two distinct usage sources:

### 1.1 Turn-Based Oral Exam Session (`REALTIME_VOICE_AGENT`)
Computed by [`lib/cost-calculator.ts`](../lib/cost-calculator.ts) during exam turns and persisted when `POST /api/exam/[sessionId]/finish` is called:

| Provider | Service / Model | Unit | Rate (USD) | Calculation Formula |
| :--- | :--- | :--- | :--- | :--- |
| **OpenAI** | `gpt-4.1-mini` (Prompt) | 1 Token | **\$0.00000015** | `tokens * (0.15 / 1,000,000)` |
| **OpenAI** | `gpt-4.1-mini` (Completion) | 1 Token | **\$0.00000060** | `tokens * (0.60 / 1,000,000)` |
| **OpenAI / Azure OpenAI Whisper** | `gpt-4o-transcribe` / `whisper` (Norwegian STT, `STT_PROVIDER=openai` or `azure-openai`) | 1 Audio Second | **\$0.00010000** | `seconds * (0.006 / 60)` |
| **Azure AI Speech** | Fast transcription `nb-NO` (`STT_PROVIDER=azure-speech`) | 1 Audio Second | **\$0.00010000** | `seconds * (0.36 / 3,600)` ¹ |
| **ElevenLabs** | `eleven_multilingual_v2` (Norwegian TTS) | 1 Character | **\$0.00007500** | `characters * (0.075 / 1,000)` ² |

$$\text{Cost}_{\text{session}} = (T_{\text{prompt}} \times 0.00000015) + (T_{\text{comp}} \times 0.00000060) + (C_{\text{tts}} \times 0.000075) + (S_{\text{audio}} \times R_{\text{stt}})$$

$R_{\text{stt}}$ is chosen at runtime from the active `STT_PROVIDER` (see `sttRatePerSecond()` in `lib/cost-calculator.ts`).

¹ About \$0.36 per audio hour. Published figures vary, so check the [Azure Speech pricing page](https://azure.microsoft.com/pricing/details/speech/) and update `PRICING_RATES.AZURE_SPEECH_FAST_STT_PER_SECOND` if needed.
² The calculator always uses the ElevenLabs character rate and the GPT-4.1-mini token rates, even with `AI_PROVIDER=azure`. Azure AI Speech neural TTS costs about \$15 per 1M characters, and Azure OpenAI pricing depends on the deployed model. Treat Azure session costs as estimates.

### 1.2 Post-Exam CEFR Rubric Evaluation (`POST_EXAM_RUBRIC_EVAL`)
Computed by [`src/lib/evaluate-exam.ts`](../src/lib/evaluate-exam.ts) when grading the transcript with OpenAI `gpt-4o`:

| Provider | Service / Model | Unit | Rate (USD) | Calculation Formula |
| :--- | :--- | :--- | :--- | :--- |
| **OpenAI** | `gpt-4o` (Prompt) | 1 Token | **\$0.00000250** | `tokens * (2.50 / 1,000,000)` |
| **OpenAI** | `gpt-4o` (Completion) | 1 Token | **\$0.00001000** | `tokens * (10.00 / 1,000,000)` |

$$\text{Cost}_{\text{eval}} = (T_{\text{prompt}} \times 0.00000250) + (T_{\text{comp}} \times 0.00001000)$$

The computed costs are formatted to 6 decimal places and stored in `estimated_cost_usd numeric(10, 6)`.

---

## 2. Quota Enforcement Logic

### Session Start Threshold:
- Candidates require strictly **more than 180 remaining seconds** (`remainingAudioSeconds > 180`) to start an exam session.
- If `user_quotas.remainingAudioSeconds <= 180`, `POST /api/exam/start` rejects the request with **HTTP 402 Payment Required** (`INSUFFICIENT_QUOTA`).

### Consumption Deduction:
- Each candidate turn in `POST /api/exam/[sessionId]/turn` deducts the rounded audio seconds (`Math.ceil(sttSeconds)`) from `user_quotas.remaining_audio_seconds` using `GREATEST(0, remaining_audio_seconds - deductedSeconds)` to prevent negative balances.
- Token counts, synthesized characters, and STT seconds are accumulated in `exam_sessions.engine_state` across turns.

---

## 3. Atomic Database Transaction Flow (`POST /api/exam/[sessionId]/finish`)

When an exam session finishes (`POST /api/exam/[sessionId]/finish`), all session status updates, usage ledger entries, and cumulative quota metrics are committed inside a single PostgreSQL transaction (`db.transaction`), and post-exam rubric grading is scheduled via Next.js `after()`:

1. **Update `exam_sessions`**: Sets `status = 'COMPLETED'` and `completedAt = new Date()`.
2. **Insert `usage_ledger`**: Records `source: 'REALTIME_VOICE_AGENT'` with `llmPromptTokens`, `llmCompletionTokens`, `ttsCharacters`, `sttAudioSeconds`, and `estimatedCostUsd`.
3. **Update `user_quotas`**: Atomically increments `totalLlmTokensUsed`, `totalTtsCharactersUsed`, `totalSttSecondsUsed`, and `totalCostUsd`.
4. **Schedule `evaluateExamSession(sessionId)`**: Executes asynchronously via Next.js `after()` and appends a second `usage_ledger` row with `source: 'POST_EXAM_RUBRIC_EVAL'`.
