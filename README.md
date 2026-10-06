# Norskprøven Muntlig B1/B2 Practice Simulator
**Next.js 15 Control Plane & Real-Time LiveKit Voice Agent Worker**

This repository contains the backend and real-time voice infrastructure for the **Norskprøven Muntlig B1/B2 Oral Exam Simulator**. It simulates the official Norwegian Directorate for Higher Education and Skills (**HK-dir**) oral examination via real-time WebRTC audio, dual AI personas, candidate debate, and automated CEFR rubric grading.

---

## Key Highlights

- **LiveKit Voice Agent Worker (`src/agent/worker.ts`)**: Built with `@livekit/agents` (v1.x) Node.js TypeScript SDK.
  - **Prewarm**: Silero VAD (`minSilenceDuration: 0.9s`) to prevent interrupting language learners during pauses.
  - **STT**: Deepgram Nova-3 with Norwegian (`no`) language support, smart formatting, filler words, and speaker diarization.
  - **LLM**: OpenAI `gpt-4.1-mini`.
  - **TTS**: ElevenLabs Flash v2.5 (`eleven_flash_v2_5`) with distinct voices for sensor and co-candidate.
- **Dual-Persona Agent Handoff**:
  - `ExaminerAgent`: Official HK-dir examiner guiding the candidate through Del 1 (monologue), Del 2 (discussion introduction), and Del 3 (follow-up questions).
  - `CoCandidateAgent`: Natural spoken Norwegian peer candidate roleplaying 5–6 debate turns before handing back to the examiner.
- **Passive Moderator Mode (`HUMAN_LOCAL`)**: Disables automatic AI turn replies (`session.pauseReplyAuthorization()`) so two candidates sharing one microphone can debate uninterrupted for up to 3 minutes or until an `END_DISCUSSION` data packet is received.
- **Zero Webhook Neon Persistence**: On session shutdown, the agent writes directly to Neon PostgreSQL in an atomic Drizzle ORM transaction and triggers post-exam grading (`evaluateExamSession`) with zero HTTP webhooks.
- **Automated Rubric Evaluation (`src/lib/evaluate-exam.ts`)**: Scores candidate performance against CEFR criteria (Pronunciation, Fluency, Vocabulary, Grammar, Coherence) using OpenAI `gpt-4o`.

---

## Repository Structure

```
├── app/                        # Next.js 15 App Router endpoints
│   ├── api/exam/start/         # Session start & LiveKit room provision
│   ├── api/exam/[sessionId]/   # Session status & rubric results
│   ├── api/quota/              # Candidate audio quota management
│   └── api/webhooks/           # Webhook handlers (legacy external agent support)
├── db/                         # Drizzle ORM schema & Neon pool
│   ├── index.ts                # Neon PostgreSQL client
│   └── schema.ts               # exam_sessions, user_quotas, usage_ledger
├── docs/                       # Complete system documentation
│   ├── ARCHITECTURE.md         # Architecture, topology & sequence flows
│   ├── LIVEKIT_VOICE_AGENT.md  # Voice agent worker deep dive
│   ├── DATABASE_SCHEMA.md      # Drizzle tables, indexes & relations
│   ├── API_REFERENCE.md        # Next.js API endpoints specification
│   ├── BILLING_AND_USAGE.md    # Cost calculations & quota formulas
│   ├── EXAM_RUBRIC_EVALUATION.md# HK-dir CEFR rubric scoring criteria
│   └── DEVELOPMENT_GUIDE.md    # Local setup & contributor guide
├── lib/                        # Core utilities & domain logic
│   ├── auth.ts                 # Bearer token authentication
│   ├── cost-calculator.ts      # Provider cost calculation
│   ├── evaluation.ts           # Asynchronous rubric evaluator
│   └── topics.ts               # Official B1/B2 oral exam topics
├── src/                        # Voice agent & shared worker modules
│   ├── agent/worker.ts         # LiveKit Voice Agent Worker
│   ├── db/index.ts             # Shared db instance with .env.local loader
│   ├── db/schema.ts            # Shared schema definitions
│   └── lib/evaluate-exam.ts    # Direct gpt-4o post-exam evaluator
└── tests/                      # Automated unit & integration tests
    ├── control-plane.test.ts   # Control plane & validation tests
    └── agent-worker.test.ts    # Voice agent & persona tests
```

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env.local` and configure your API keys:
```bash
cp .env.example .env.local
```

### 3. Run the Next.js API Server
```bash
npm run dev
```

### 4. Run the LiveKit Voice Agent Worker
```bash
# Development mode (with live watch & auto-reload)
npm run agent:dev

# Production mode
npm run agent:start
```

### 5. Run Automated Tests
```bash
npm test
```

### 6. TypeScript Typecheck
```bash
npx tsc --noEmit
```

---

## Documentation Index

For detailed guides and architecture specifications, visit the [`docs/`](./docs/README.md) folder:
- [Architecture & System Flow](./docs/ARCHITECTURE.md)
- [LiveKit Voice Agent Worker Guide](./docs/LIVEKIT_VOICE_AGENT.md)
- [Database Schema & Models](./docs/DATABASE_SCHEMA.md)
- [API Reference](./docs/API_REFERENCE.md)
- [Billing, Costs & Quotas](./docs/BILLING_AND_USAGE.md)
- [B1/B2 Rubric Evaluation](./docs/EXAM_RUBRIC_EVALUATION.md)
- [Developer Guide](./docs/DEVELOPMENT_GUIDE.md)
