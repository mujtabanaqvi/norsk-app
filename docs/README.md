# Norskprøven Muntlig B1/B2 Simulator — System Documentation

Welcome to the documentation for the **Norskprøven Muntlig B1/B2 Practice Simulator Backend Control Plane**.

> **Note for AI Agents & Developers:**  
> When handling any new feature request or refactoring task, read this document and the relevant guides in this folder first. It provides the exact source of truth for the codebase architecture, database contracts, API specifications, and business rules.

---

## Documentation Index

| Document | Purpose |
| :--- | :--- |
| **[1. Architecture & System Flow](./ARCHITECTURE.md)** | High-level system design, LiveKit integration, and end-to-end sequence diagrams. |
| **[2. Database Schema & Models](./DATABASE_SCHEMA.md)** | Drizzle ORM models (`user_quotas`, `exam_sessions`, `usage_ledger`), relations, and migration commands. |
| **[3. API Reference](./API_REFERENCE.md)** | Specification of all Next.js API routes, headers, request/response payloads, and error codes. |
| **[4. Billing, Costs & Quota Ledger](./BILLING_AND_USAGE.md)** | Pricing formulas for OpenAI GPT-4.1-mini, ElevenLabs Flash v2.5, Deepgram Nova-3, and atomic quota transactions. |
| **[5. B1/B2 Rubric Evaluation Engine](./EXAM_RUBRIC_EVALUATION.md)** | HK-dir CEFR scoring criteria, prompt templates, JSON schema, and async execution lifecycle. |
| **[6. Developer & Contributor Guide](./DEVELOPMENT_GUIDE.md)** | Local environment setup, running tests, generating migrations, and guidelines for adding new features. |

---

## Tech Stack Overview

- **Framework**: Next.js 15 (App Router, Route Handlers, TypeScript 5.7+).
- **Database & ORM**: PostgreSQL with Drizzle ORM (`drizzle-orm`, `drizzle-kit`, `pg`).
- **Real-Time Audio / Video**: LiveKit (`livekit-server-sdk` with `RoomServiceClient` and `AccessToken`).
- **AI Providers**:
  - **OpenAI**: GPT-4.1-mini / GPT-4o-mini (evaluation engine and agent conversation).
  - **ElevenLabs**: Flash v2.5 (Examiner and Co-candidate TTS voices).
  - **Deepgram**: Nova-3 (real-time Norwegian speech-to-text).
- **Validation**: Zod (strict runtime request & payload validation).
- **Testing**: Node.js native test runner via `npx tsx --test`.

---

## Core Business Invariants

1. **Minimum Quota to Start**: A candidate must have strictly more than **180 seconds** (`user_quotas.remainingSeconds > 180`) to start an exam session. Otherwise, `HTTP 402 Payment Required` is returned.
2. **Room Naming & Metadata**: LiveKit rooms must be named `exam_${sessionId}`. Room metadata must be JSON-serialized containing `{ sessionId, userId, level, coCandidateMode, topicPrompt }`.
3. **Webhook Security**: Inbound agent webhook (`/api/webhooks/agent-complete`) strictly requires `Authorization: Bearer ${process.env.AGENT_WEBHOOK_SECRET}` validated via constant-time comparison.
4. **Atomic Ingestion**: Webhook execution guarantees that adding the `usage_ledger` entry, updating `user_quotas`, and completing `exam_sessions` happens in a single PostgreSQL transaction.
5. **Non-blocking Evaluation**: B1/B2 rubric grading runs asynchronously after the transaction commits, ensuring the LiveKit Agent webhook receives an immediate `200 OK`.

