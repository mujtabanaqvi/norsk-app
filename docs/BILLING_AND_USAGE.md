# Billing, Costs & Quota Ledger

This document details how the control plane computes AI provider costs, enforces oral practice limits, and guarantees financial data integrity using atomic transactions.

---

## 1. Provider Pricing Rates

Infrastructure cost estimation is computed using standard unit prices across two distinct usage sources:

### 1.1 Real-Time Oral Exam Session (`REALTIME_VOICE_AGENT`)
Computed by [`lib/cost-calculator.ts`](../lib/cost-calculator.ts) during live WebRTC practice:

| Provider | Service / Model | Unit | Rate (USD) | Calculation Formula |
| :--- | :--- | :--- | :--- | :--- |
| **OpenAI** | GPT-4.1-mini (Prompt) | 1 Token | **\$0.00000015** | `tokens * (0.15 / 1,000,000)` |
| **OpenAI** | GPT-4.1-mini (Completion) | 1 Token | **\$0.00000060** | `tokens * (0.60 / 1,000,000)` |
| **ElevenLabs** | Flash v2.5 (Norwegian TTS) | 1 Character | **\$0.00007500** | `characters * (0.075 / 1,000)` |
| **Deepgram** | Nova-3 (Norwegian STT) | 1 Audio Second | **\$0.00007167** | `seconds * (0.0043 / 60)` |

$$\text{Cost}_{\text{realtime}} = (T_{\text{prompt}} \times 0.00000015) + (T_{\text{comp}} \times 0.00000060) + (C_{\text{tts}} \times 0.000075) + (S_{\text{audio}} \times 0.00007167)$$

### 1.2 Post-Exam CEFR Rubric Evaluation (`POST_EXAM_RUBRIC_EVAL`)
Computed by [`src/lib/evaluate-exam.ts`](../src/lib/evaluate-exam.ts) when grading the transcript with OpenAI `gpt-4o`:

| Provider | Service / Model | Unit | Rate (USD) | Calculation Formula |
| :--- | :--- | :--- | :--- | :--- |
| **OpenAI** | GPT-4o (Prompt) | 1 Token | **\$0.00000250** | `tokens * (2.50 / 1,000,000)` |
| **OpenAI** | GPT-4o (Completion) | 1 Token | **\$0.00001000** | `tokens * (10.00 / 1,000,000)` |

$$\text{Cost}_{\text{eval}} = (T_{\text{prompt}} \times 0.00000250) + (T_{\text{comp}} \times 0.00001000)$$

The computed costs are formatted to 6 decimal places and stored in `estimated_cost_usd numeric(10, 6)`.

---

## 2. Quota Enforcement Logic

### Session Start Threshold:
- Candidates require strictly **more than 180 remaining seconds** (`remainingAudioSeconds > 180`) to start an exam session.
- If `user_quotas.remainingAudioSeconds <= 180`, `POST /api/exam/start` rejects the request with **HTTP 402 Payment Required** (`INSUFFICIENT_QUOTA`) and refuses to create a LiveKit room or mint tokens.

### Consumption Deduction:
- STT audio seconds (`sttAudioSeconds`) reported by the LiveKit agent worker represent candidate speech duration.
- The deducted quota is rounded up to the nearest integer second:
  $$\text{deductedSeconds} = \lceil \text{sttAudioSeconds} \rceil$$
- Remaining seconds are updated safely using `GREATEST(0, remaining_audio_seconds - deductedSeconds)` to prevent negative balances.

---

## 3. Atomic Database Transaction Flow

On worker shutdown (`ctx.addShutdownCallback`), all usage metrics, quota adjustments, and session status updates are committed within a single PostgreSQL transaction (`db.transaction`):

```typescript
await db.transaction(async (tx) => {
  // 1. Insert immutable usage ledger entry for REALTIME_VOICE_AGENT
  await tx.insert(usageLedger).values({
    id: crypto.randomUUID(),
    sessionId: metadata.sessionId,
    userId: metadata.userId,
    source: 'REALTIME_VOICE_AGENT',
    llmModel: 'gpt-4.1-mini',
    llmPromptTokens: summary.llmPromptTokens,
    llmCompletionTokens: summary.llmCompletionTokens,
    ttsCharacters: summary.ttsCharactersCount,
    sttAudioSeconds: sttAudioSeconds.toFixed(2),
    estimatedCostUsd,
    createdAt: new Date(),
  });

  // 2. Atomically debit user quota and aggregate lifetime usage
  await tx
    .insert(userQuotas)
    .values({
      userId: metadata.userId,
      remainingAudioSeconds: Math.max(0, 1800 - secondsToDeduct),
      totalLlmTokensUsed: totalTokensUsed,
      totalTtsCharactersUsed: summary.ttsCharactersCount,
      totalSttSecondsUsed: sttAudioSeconds.toFixed(2),
      totalCostUsd: estimatedCostUsd,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userQuotas.userId,
      set: {
        remainingAudioSeconds: sql`GREATEST(0, ${userQuotas.remainingAudioSeconds} - ${secondsToDeduct})`,
        totalLlmTokensUsed: sql`${userQuotas.totalLlmTokensUsed} + ${totalTokensUsed}`,
        totalTtsCharactersUsed: sql`${userQuotas.totalTtsCharactersUsed} + ${summary.ttsCharactersCount}`,
        totalSttSecondsUsed: sql`(${userQuotas.totalSttSecondsUsed} + ${sttAudioSeconds.toFixed(2)}::numeric)`,
        totalCostUsd: sql`(${userQuotas.totalCostUsd} + ${estimatedCostUsd}::numeric)`,
        updatedAt: new Date(),
      },
    });

  // 3. Mark exam session completed and attach transcript
  await tx
    .update(examSessions)
    .set({
      status: 'COMPLETED',
      transcriptJson: transcriptEntries,
      completedAt: new Date(),
    })
    .where(eq(examSessions.id, metadata.sessionId));
});
```

### Invariants Guaranteed:
- If any operation fails, the transaction rolls back cleanly.
- An exam session cannot transition to `COMPLETED` without a corresponding `usage_ledger` record.
- Token counts, audio seconds, and costs are atomically aggregated concurrently safe.
