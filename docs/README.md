# Norskprøven Muntlig B1/B2 Simulator — System Documentation

Welcome to the documentation for the **Norskprøven Muntlig B1/B2 Practice Simulator**.

> **Note for AI Agents & Developers:**  
> When handling any new feature request or refactoring task, read this document and the relevant guides in this folder first. It provides the exact source of truth for the codebase architecture, database contracts, API specifications, and business rules.

---

## Documentation Index

| Document | Purpose |
| :--- | :--- |
| **[1. Architecture & System Flow](./ARCHITECTURE.md)** | High-level system design, mobile client flow, LiveKit integration, and end-to-end sequence diagrams. |
| **[2. Local Development & Run Sequence Guide](./DEVELOPMENT_GUIDE.md)** | Local environment setup, step-by-step startup sequence, seed data execution, and test commands. |
| **[3. LiveKit Voice Agent Worker](./LIVEKIT_VOICE_AGENT.md)** | Voice agent (`src/agent/worker.ts`), dual-persona handoff, passive moderator, and zero-webhook Neon persistence. |
| **[4. Database Schema & Models](./DATABASE_SCHEMA.md)** | Drizzle ORM models (`exam_topics`, `user_quotas`, `exam_sessions`, `usage_ledger`), relations, and migration commands. |
| **[5. API Reference Specification](./API_REFERENCE.md)** | Specification of all Next.js API routes (`topics`, `start`, `results`, `quota`), headers, query parameters, payloads, and error codes. |
| **[6. Billing, Costs & Quota Ledger](./BILLING_AND_USAGE.md)** | Pricing formulas for OpenAI GPT-4.1-mini, ElevenLabs Flash v2.5, Deepgram Nova-3, and atomic quota transactions. |
| **[7. HK-dir B1/B2 Rubric Evaluation Engine](./EXAM_RUBRIC_EVALUATION.md)** | Official 4 HK-dir criteria (1–10 scale), bilingual feedback, concrete improvements, and GPT-4o execution lifecycle. |

---

## Tech Stack Overview

- **Framework**: Next.js 15 (App Router, Route Handlers, TypeScript 5.7+).
- **Mobile Client**: React Native with `@livekit/react-native`, `@react-navigation/native-stack`, and `@livekit/react-native-webrtc`.
- **Database & ORM**: PostgreSQL (Neon Serverless) with Drizzle ORM (`drizzle-orm`, `drizzle-kit`, `postgres`).
- **Real-Time Audio / Video**: LiveKit (`@livekit/agents` v1.x, `livekit-server-sdk`, `livekit-client`).
- **AI Providers**:
  - **OpenAI**: GPT-4.1-mini (real-time voice conversation) and GPT-4o (comprehensive post-exam CEFR rubric evaluation).
  - **ElevenLabs**: Flash v2.5 (`eleven_flash_v2_5`) with distinct voices for examiner sensor and peer co-candidate.
  - **Deepgram**: Nova-3 with Norwegian (`no`) language support, smart formatting, filler words, and speaker diarization.
- **Validation**: Zod (strict runtime request & payload validation).
- **Testing**: Node.js native test runner via `tsx --test tests/*.test.ts`.

---

## Core Business Invariants

1. **Minimum Quota to Start**: A candidate must have strictly more than **180 seconds** (`user_quotas.remainingAudioSeconds > 180`) to start an exam session. Otherwise, `HTTP 402 Payment Required` (`INSUFFICIENT_QUOTA`) is returned.
2. **Room Naming & Metadata**: LiveKit rooms must be named `exam_${sessionId}`. Room metadata is serialized JSON containing `{ sessionId, userId, level, coCandidateMode, topic }`.
3. **Zero-Webhook Direct DB Persistence**: The voice agent worker writes directly to Neon PostgreSQL on session shutdown (`ctx.addShutdownCallback`) inside an atomic `db.transaction()`, logging usage, deducting candidate audio seconds, and saving the transcript without external HTTP webhooks.
4. **Immediate Post-Exam Rubric Evaluation**: Upon room shutdown, the worker triggers `evaluateExamSession(sessionId)` directly against Neon, executing HK-dir CEFR grading via OpenAI `gpt-4o` (or rule-based fallback).
5. **Client Polling Contract**: Mobile clients poll `GET /api/exam/${sessionId}/results` every 3 seconds until the session status transitions from `ACTIVE` to `COMPLETED` and `evaluationJson` is populated.


