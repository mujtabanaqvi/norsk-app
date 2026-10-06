# Architecture & System Design

This document describes the architectural topology, service interactions, and lifecycle flows of the Norwegian Oral Exam Simulator backend control plane.

---

## 1. System Topology

```
┌─────────────────────────────────┐
│       React Native Client       │
│      (iOS / Android Mobile)     │
└───────────────┬─────────────────┘
                │ 1. POST /api/exam/start (Bearer token)
                │    Returns { token, roomName, sessionId, livekitUrl }
                ▼
┌────────────────────────────────────────────────────────┐
│             Next.js 15 Control Plane                   │
│   ├── /api/exam/start        (Session provision)       │
│   ├── /api/webhooks/...      (Agent completion sync)   │
│   ├── /api/exam/[sessionId]  (Result fetching)         │
│   └── /api/quota             (Quota management)        │
└────────┬───────────────────────────┬───────────────────┘
         │                           │
         │ RoomServiceClient         │ Drizzle ORM
         │ AccessToken               │ PostgreSQL
         ▼                           ▼
┌──────────────────┐        ┌──────────────────┐
│  LiveKit Cloud   │        │    PostgreSQL    │
│  (WebRTC SFU)    │        │  - user_quotas   │
└────────▲─────────┘        │  - exam_sessions │
         │                  │  - usage_ledger  │
         │ Room Join        └──────────────────┘
         │
┌────────┴──────────────────────────┐
│    LiveKit Agent Worker           │
│  (Python / Node Voice Agent)      │
│  ├── Deepgram Nova-3 (STT)        │
│  ├── GPT-4.1-mini / GPT-4o-mini   │
│  └── ElevenLabs Flash v2.5 (TTS)  │
└────────────────┬──────────────────┘
                 │
                 │ 2. POST /api/webhooks/agent-complete
                 │    (Bearer AGENT_WEBHOOK_SECRET)
                 ▼
     [Back to Next.js Control Plane]
```

---

## 2. End-to-End Execution Sequence

### Flow A: Start Practice Session

```mermaid
sequenceDiagram
    autonumber
    actor Candidate as React Native App
    participant ControlPlane as Next.js API (/api/exam/start)
    participant DB as PostgreSQL (Drizzle)
    participant LiveKit as LiveKit Cloud

    Candidate->>ControlPlane: POST /api/exam/start { level, coCandidateMode, topicId }
    Note over ControlPlane: Authenticate user & validate body (Zod)
    ControlPlane->>DB: SELECT remaining_seconds FROM user_quotas
    alt remainingSeconds <= 180
        ControlPlane-->>Candidate: 402 Payment Required (INSUFFICIENT_QUOTA)
    else remainingSeconds > 180
        ControlPlane->>DB: INSERT INTO exam_sessions (id, status='ACTIVE', topic)
        ControlPlane->>LiveKit: RoomServiceClient.createRoom(roomName, metadata)
        Note over ControlPlane: Mint participant AccessToken (grants: audio, data)
        ControlPlane-->>Candidate: 201 Created { token, roomName, sessionId, livekitUrl }
    end
```

### Flow B: LiveKit Voice Session & Agent Worker

```mermaid
sequenceDiagram
    autonumber
    actor Candidate as React Native App
    participant LiveKit as LiveKit Cloud
    participant Agent as LiveKit Agent Worker

    Candidate->>LiveKit: Connect via token to exam_${sessionId}
    Agent->>LiveKit: Joins room, reads room metadata { sessionId, level, topicPrompt }
    Agent->>LiveKit: Plays examiner intro in Norwegian (ElevenLabs)
    loop Active Oral Exam Conversation
        Candidate->>LiveKit: Speaks (audio stream)
        LiveKit->>Agent: Audio stream forwarded
        Agent->>Agent: Deepgram Nova-3 transcribes audio (STT)
        Agent->>Agent: GPT-4.1-mini evaluates topic context & generates reply
        Agent->>LiveKit: ElevenLabs Flash synthesizes Norwegian speech (TTS)
    end
    Agent->>LiveKit: Examiner concludes exam, disconnects
```

### Flow C: Webhook Ingestion & Rubric Evaluation

```mermaid
sequenceDiagram
    autonumber
    participant Agent as LiveKit Agent Worker
    participant ControlPlane as Next.js API (/api/webhooks/agent-complete)
    participant DB as PostgreSQL (Drizzle)
    participant OpenAI as OpenAI GPT-4o-mini

    Agent->>ControlPlane: POST /api/webhooks/agent-complete (Bearer AGENT_WEBHOOK_SECRET)<br/>{ sessionId, userId, usage, transcript }
    Note over ControlPlane: Timing-safe secret verification & Zod parsing
    Note over ControlPlane: Calculate estimatedCostUsd (GPT-4.1-mini + ElevenLabs + Deepgram)
    
    rect rgb(240, 248, 255)
        Note over ControlPlane,DB: Atomic PostgreSQL Transaction
        ControlPlane->>DB: 1. INSERT INTO usage_ledger
        ControlPlane->>DB: 2. UPDATE user_quotas (deduct STT seconds, add tokens & cost)
        ControlPlane->>DB: 3. UPDATE exam_sessions (status='COMPLETED', transcript_json)
    end

    ControlPlane-->>Agent: 200 OK { success: true, ledgerId, costBreakdown }
    
    Note over ControlPlane: Asynchronous (Non-blocking) Rubric Evaluation
    ControlPlane->>OpenAI: chat.completions.create(system=HK-dir CEFR B1/B2 rubric, transcript)
    OpenAI-->>ControlPlane: Structured evaluation JSON
    ControlPlane->>DB: UPDATE exam_sessions SET evaluation_json = ...
```

---

## 3. Component Responsibilities

### 1. `app/api/exam/start/route.ts`
- Verifies identity via `lib/auth.ts`.
- Enforces the **> 180 seconds** hard threshold.
- Creates unique session ID (`UUIDv4`).
- Calls LiveKit `RoomServiceClient.createRoom` with session metadata stringified.
- Mints participant `AccessToken` with a 2-hour TTL and permissions for `roomJoin`, `canPublish`, `canSubscribe`, and `canPublishData`.

### 2. `app/api/webhooks/agent-complete/route.ts`
- Validates the agent webhook bearer secret using `crypto.timingSafeEqual`.
- Validates payload structure (UUID sessionId, non-negative usage counts, transcript entry array).
- Executes `calculateEstimatedCostUsd()` across the three provider rates.
- Wraps ledger insertion, quota updates, and session transcript updates inside `db.transaction()`.
- Dispatches asynchronous CEFR rubric evaluation.

### 3. `lib/cost-calculator.ts`
- Provides cost calculations formatted to 6 decimal places (`numeric(12, 6)`).
- See [BILLING_AND_USAGE.md](./BILLING_AND_USAGE.md) for rate constants.

### 4. `lib/evaluation.ts`
- Contains the official CEFR B1/B2 assessment prompt based on Norwegian Directorate for Higher Education and Skills (HK-dir) criteria.
- Runs non-blocking and writes back to `exam_sessions.evaluation_json`.

