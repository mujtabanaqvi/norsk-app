# Billing, Costs & Quota Ledger

This document details how the control plane computes AI provider costs, enforces practice limits, and guarantees financial data integrity using atomic transactions.

---

## 1. Provider Pricing Rates

Infrastructure cost estimation is computed in [`lib/cost-calculator.ts`](../lib/cost-calculator.ts) using the following baseline unit prices:

| Provider | Service / Model | Unit | Rate (USD) | Formula |
| :--- | :--- | :--- | :--- | :--- |
| **OpenAI** | GPT-4.1-mini (Prompt) | 1 Token | **\$0.00000015** | `tokens * (0.15 / 1,000,000)` |
| **OpenAI** | GPT-4.1-mini (Completion) | 1 Token | **\$0.00000060** | `tokens * (0.60 / 1,000,000)` |
| **ElevenLabs** | Flash v2.5 (Norwegian TTS) | 1 Character | **\$0.00007500** | `characters * (0.075 / 1,000)` |
| **Deepgram** | Nova-3 (Norwegian STT) | 1 Audio Second | **\$0.00007167** | `seconds * (0.0043 / 60)` |

### Formula:
$$\text{Cost} = (T_{\text{prompt}} \times 0.00000015) + (T_{\text{completion}} \times 0.00000060) + (C_{\text{tts}} \times 0.000075) + (S_{\text{audio}} \times 0.00007167)$$

The result is saved with 6 decimal places into `estimated_cost_usd numeric(12, 6)`.

---

## 2. Quota Enforcement Logic

### Session Start Threshold:
- Candidates require strictly **more than 180 remaining seconds** (`remainingSeconds > 180`) to start an exam.
- If `user_quotas.remainingSeconds <= 180`, the API rejects the request with **HTTP 402 Payment Required** and does not mint a LiveKit room or token.

### Consumption Deduction:
- STT audio seconds (`sttAudioSeconds`) reported by the LiveKit agent worker represent the spoken candidate duration.
- The deducted quota is rounded up:
  $$\text{deductedSeconds} = \lceil \text{sttAudioSeconds} \rceil$$
- Remaining seconds are updated using `GREATEST(0, remaining_seconds - deductedSeconds)` to prevent negative balances.

---

## 3. Atomic Database Transaction Flow

To prevent race conditions, orphaned billing records, or unbilled usage, the webhook applies all updates within a single PostgreSQL transaction (`db.transaction`):

```typescript
await db.transaction(async (tx) => {
  // 1. Insert immutable usage ledger entry
  await tx.insert(usageLedger).values({ ... });

  // 2. Atomically debit user quota and aggregate lifetime usage
  await tx
    .insert(userQuotas)
    .values({ ... })
    .onConflictDoUpdate({
      target: userQuotas.userId,
      set: {
        remainingSeconds: sql`GREATEST(0, ${userQuotas.remainingSeconds} - ${secondsToDeduct})`,
        totalTokensUsed: sql`${userQuotas.totalTokensUsed} + ${totalTokensUsed}`,
        totalCostUsd: sql`(${userQuotas.totalCostUsd} + ${estimatedCostUsd}::numeric)`,
        updatedAt: new Date(),
      },
    });

  // 3. Mark exam session completed and attach transcript
  await tx
    .update(examSessions)
    .set({
      status: 'COMPLETED',
      transcriptJson: transcript,
      updatedAt: new Date(),
    })
    .where(eq(examSessions.id, sessionId));
});
```

### Invariants Guaranteed:
- If an update fails, the entire transaction rolls back.
- Sessions cannot be marked `COMPLETED` without an accompanying `usage_ledger` row.
- Token counts and cost calculations are aggregated concurrently safe via PostgreSQL atomic increments.

