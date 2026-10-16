# Norskprøven Muntlig B1/B2 Simulator — System Documentation

Welcome to the documentation for the **Norskprøven Muntlig B1/B2 Practice Simulator**.

> **Note for AI Agents & Developers:**  
> When handling any new feature request or refactoring task, read this document and the relevant guides in this folder first. It provides the exact source of truth for the codebase architecture, database contracts, API specifications, and business rules.

---

## Documentation Index

| Document | Purpose |
| :--- | :--- |
| **[1. Architecture & System Flow](./ARCHITECTURE.md)** | High-level system design, turn-based voice pipeline, exam state machine, and end-to-end sequence diagrams. |
| **[2. Local Development & Run Sequence Guide](./DEVELOPMENT_GUIDE.md)** | Local environment setup, 2-terminal startup sequence, Expo Go testing, seed data execution, and test commands. |
| **[3. Database Schema & Models](./DATABASE_SCHEMA.md)** | Drizzle ORM models (`exam_topics`, `user_quotas`, `exam_sessions`, `usage_ledger`), relations, and migration commands. |
| **[4. API Reference Specification](./API_REFERENCE.md)** | Specification of all Next.js API routes (`topics`, `start`, `turn`, `speech`, `finish`, `results`, `quota`). |
| **[5. Billing, Costs & Quota Ledger](./BILLING_AND_USAGE.md)** | Pricing formulas for OpenAI GPT-4.1-mini, OpenAI STT, ElevenLabs TTS, and atomic quota transactions. |
| **[6. HK-dir B1/B2 Rubric Evaluation Engine](./EXAM_RUBRIC_EVALUATION.md)** | Official 4 HK-dir criteria (1–10 scale), bilingual feedback, concrete improvements, and GPT-4o execution lifecycle. |

---

## Tech Stack Overview

- **Framework**: Next.js 16 (App Router, Route Handlers, `proxy.ts` CORS, `after()` background tasks, TypeScript).
- **Mobile Client**: React Native (Expo SDK 54) with `expo-audio`, `expo-constants`, `expo-secure-store`, and `@react-navigation/native-stack` — runs directly inside **Expo Go** and **Web**.
- **Database & ORM**: PostgreSQL (Neon Serverless) with Drizzle ORM (`drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`).
- **AI Providers**:
  - **OpenAI**: `gpt-4o-transcribe` (Norwegian speech-to-text), `gpt-4.1-mini` (conversational Examiner and Co-Candidate turns), `gpt-4o` (post-exam CEFR rubric evaluation), and `gpt-4o-mini-tts` (automatic TTS fallback).
  - **ElevenLabs**: `eleven_multilingual_v2` streaming TTS with distinct voices for the Examiner Sensor and Peer Co-Candidate.
- **Validation**: Zod (strict runtime request & payload validation).
- **Testing**: Node.js native test runner via `tsx --test tests/*.test.ts`.

---

## Core Business Invariants

1. **Minimum Quota to Start**: A candidate must have strictly more than **180 seconds** (`user_quotas.remainingAudioSeconds > 180`) to start an exam session. Otherwise, `HTTP 402 Payment Required` (`INSUFFICIENT_QUOTA`) is returned.
2. **Deterministic Exam State Machine**: Every exam session progresses deterministically through `DEL1_MONOLOGUE` → `DEL2_AI` (or `DEL2_HUMAN`) → `DEL3` → `DONE`, persisted in `exam_sessions.engine_state`.
3. **Turn-Based Voice Pipeline**: Candidate audio is recorded with `expo-audio`, uploaded via `POST /api/exam/[sessionId]/turn`, transcribed in Norwegian, processed by the exam state machine and persona LLM, and played back via `GET /api/exam/[sessionId]/speech/[turnIndex]`.
4. **Atomic Finish & Post-Exam Rubric Evaluation**: Calling `POST /api/exam/[sessionId]/finish` atomically marks the session `COMPLETED`, records usage in `usage_ledger`, updates `user_quotas`, and schedules `evaluateExamSession(sessionId)` via Next.js `after()`.
5. **Client Polling Contract**: Mobile clients poll `GET /api/exam/${sessionId}/results` every 3 seconds until `status === 'COMPLETED'` and `evaluationJson` is populated.
