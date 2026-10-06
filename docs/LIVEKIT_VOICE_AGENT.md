# LiveKit Voice Agent Worker (`src/agent/worker.ts`)

This document details the architecture, configuration, dual-persona workflow, and direct Neon database persistence of the **LiveKit Voice Agent Worker** (`src/agent/worker.ts`), built with the `@livekit/agents` (v1.x) Node.js TypeScript SDK.

---

## 1. Overview & Architecture

The Voice Agent runs directly within the repository and shares the existing **Drizzle ORM** instance, database schema, and post-exam rubric evaluator with **zero HTTP webhook handshakes**.

```
┌────────────────────────────────────────────────────────┐
│                   LiveKit Cloud SFU                    │
│   (WebRTC Audio Streams, Data Packets, Participant RPC)│
└───────────────────────────▲────────────────────────────┘
                            │
              Audio Streams │ DataPackets
                            ▼
┌────────────────────────────────────────────────────────┐
│             Voice Agent Worker (src/agent/worker.ts)    │
│                                                        │
│  ├── Prewarm: Silero VAD (minSilenceDuration: 0.9s)   │
│  ├── STT: Deepgram Nova-3 (Norwegian, diarization)     │
│  ├── LLM: OpenAI GPT-4.1-mini                         │
│  ├── TTS: ElevenLabs Flash v2.5 (Examiner & Peer)     │
│                                                        │
│  ┌───────────────────────┐   ┌───────────────────────┐ │
│  │     ExaminerAgent     │   │   CoCandidateAgent    │ │
│  │ (Official HK-dir      ├───┤ (Peer B1/B2 roleplay, │ │
│  │  Del 1, 2, 3 sensor)  │   │  5-6 turns debate)    │ │
│  └──────────┬────────────┘   └───────────────────────┘ │
│             │                                          │
│             ▼                                          │
│     Passive Moderator Mode                             │
│     (HUMAN_LOCAL 2-human debate, no AI interruption)   │
└───────────────────────────┬────────────────────────────┘
                            │
               Direct Neon DB Persistence
               (ctx.addShutdownCallback - Zero Webhook)
                            ▼
┌────────────────────────────────────────────────────────┐
│             Neon Serverless PostgreSQL (Drizzle)       │
│  1. Insert usage record into usage_ledger              │
│  2. Atomically deduct seconds from user_quotas         │
│  3. Mark exam_sessions as COMPLETED with transcript    │
│  4. Invoke evaluateExamSession() via OpenAI GPT-4o     │
└────────────────────────────────────────────────────────┘
```

---

## 2. Shared Code & Database Access

The agent worker directly imports and shares:
- **`src/db/index.ts`**: Shared Drizzle PostgreSQL connection pool with automated `.env.local` loading.
- **`src/db/schema.ts`**: Shared tables (`examSessions`, `userQuotas`, `usageLedger`) and CEFR rubric TypeScript types (`TranscriptEntry`, `ExamEvaluation`).
- **`src/lib/evaluate-exam.ts`**: Standalone evaluation engine (`evaluateExamSession(sessionId)`) executing OpenAI `gpt-4o` rubric scoring directly against Neon.

---

## 3. Pipeline Configuration

### Silero VAD (Prewarm)
```typescript
prewarm: async (proc: JobProcess) => {
  proc.userData.vad = await silero.VAD.load({ minSilenceDuration: 0.9 });
}
```
Preloaded in `prewarm` with a `minSilenceDuration` of **0.9 seconds** so B1/B2 language learners are not interrupted when pausing to formulate their thoughts.

### Room Metadata Contract
The worker expects JSON metadata in `ctx.room.metadata`:
```typescript
interface SessionMetadata {
  sessionId: string;
  userId: string;
  level: 'B1' | 'B2';
  coCandidateMode: 'AI_PEER' | 'HUMAN_LOCAL';
  topic: {
    titleNo: string;
    monologuePromptNo: string;
    discussionPromptNo: string;
    followUpQuestionsNo: string[];
  };
}
```

### Deepgram STT (`nova-3`)
- `model`: `"nova-3"`
- `language`: `"no"` (Norwegian)
- `smartFormat`: `true`
- `fillerWords`: `true`
- `diarize`: `metadata.coCandidateMode === 'HUMAN_LOCAL'` (identifies Speaker 0 vs Speaker 1 when two candidates share a single microphone).

### OpenAI LLM
- `model`: `"gpt-4.1-mini"`

---

## 4. Dual-Persona Agent Handoff

The exam workflow features two distinct agent classes:

### 1. `ExaminerAgent extends voice.Agent`
- **Voice**: ElevenLabs Flash v2.5 (`model: "eleven_flash_v2_5"`, `voiceId: process.env.ELEVEN_EXAMINER_VOICE_ID`).
- **System Instructions**: Acts as an official sensor for HK-dir Norskprøven muntlig at the requested CEFR level (`B1` or `B2`).
- **Structure**:
  - **Del 1 (Individuell monolog)**: Introduces the monologue prompt (`topic.monologuePromptNo`).
  - **Del 2 (Samtaleoppgave)**: Introduces the debate prompt (`topic.discussionPromptNo`) and invokes the corresponding tool.
  - **Del 3 (Oppfølgingsspørsmål)**: Asks questions from `topic.followUpQuestionsNo` and formally concludes the exam.
- **Tools**:
  - `startAiPeerDiscussion`: Used in `AI_PEER` mode. Performs an `llm.handoff` to `CoCandidateAgent` while copying the chat context (`chatCtx.copy()`).
  - `startHumanLocalDiscussion`: Used in `HUMAN_LOCAL` mode. Activates Passive Moderator Mode.

### 2. `CoCandidateAgent extends voice.Agent`
- **Voice**: ElevenLabs Flash v2.5 (`model: "eleven_flash_v2_5"`, `voiceId: process.env.ELEVEN_COCANDIDATE_VOICE_ID`).
- **System Instructions**: Roleplays a fellow candidate taking the exam at the candidate's level.
- **Behavior**: Speaks in natural Norwegian (2–3 sentences per turn), offering opinions and asking follow-ups (*"Hva tenker du om det?"*, *"Jeg er litt uenig fordi..."*).
- **Tool**:
  - `returnToExaminer`: Called after 5–6 conversation turns to hand control back to `ExaminerAgent` for Del 3.

---

## 5. Passive Moderator Mode (`HUMAN_LOCAL`)

In `HUMAN_LOCAL` mode, two human candidates sit together and share a single microphone:
1. `ExaminerAgent` calls `startHumanLocalDiscussion`.
2. The agent pauses automatic turn replies via `session.pauseReplyAuthorization()`.
3. The two humans speak back-and-forth freely without AI interruption.
4. Deepgram STT diarizes turns into `CANDIDATE_1` and `CANDIDATE_2`.
5. Passive mode exits upon:
   - A LiveKit DataPacket `{"action": "END_DISCUSSION"}` received via `ctx.room.on('dataReceived', ...)`, **OR**
   - A **180-second** timeout.
6. When triggered, the worker calls `session.resumeReplyAuthorization()` and prompts `ExaminerAgent` to start Del 3.

---

## 6. Direct Neon Persistence on Shutdown (Zero Webhooks)

When the session terminates, `ctx.addShutdownCallback` runs:
1. **Summary**: Reads usage stats from `metrics.UsageCollector` attached to `AgentSessionEventTypes.MetricsCollected`.
2. **Cost Calculation**: Computes exact provider usage and cost using `calculateEstimatedCostUsd()`.
3. **Atomic Neon Transaction**:
   ```typescript
   await db.transaction(async (tx) => {
     // 1. Audit ledger entry for REALTIME_VOICE_AGENT
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

     // 2. Atomic user quota deduction & metrics accumulation
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

     // 3. Mark session complete and save transcript
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
4. **Direct Evaluation**: Calls `await evaluateExamSession(metadata.sessionId)` to grade the transcript using OpenAI `gpt-4o` and store `evaluationJson` in Neon.

---

## 7. Running the Worker

### Development Mode (with hot-reload)
```bash
npm run agent:dev
```

### Production Mode
```bash
npm run agent:start
```

### Preloading Models
```bash
npm run agent:download-files
```

### Running Automated Tests
```bash
npm test
```

