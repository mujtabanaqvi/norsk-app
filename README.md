# Norskprøven Muntlig B1/B2 Practice Simulator
**Next.js 15 Control Plane, Real-Time LiveKit Voice Agent Worker & React Native Client**

This repository contains the complete full-stack infrastructure and mobile interfaces for the **Norskprøven Muntlig B1/B2 Oral Exam Simulator**. It simulates the official Norwegian Directorate for Higher Education and Skills (**HK-dir**) oral examination through real-time WebRTC audio, dual AI personas, candidate debate, automated CEFR rubric grading, and cross-platform mobile client screens.

---

## Architecture & System Highlights

- **React Native Mobile Client (`src/screens/*`)**:
  - `ExamSetupScreen.tsx`: Audio device checks, CEFR level selection (B1 / B2), official topic catalog selector, exam mode selection (`AI_PEER` vs `HUMAN_LOCAL`), real-time quota verification, and room initialization.
  - `ExamRoomScreen.tsx`: Real-time WebRTC audio room with `@livekit/react-native`, live animated audio waveform bars, active speaker avatars (Examiner, Candidate, Co-Candidate), auto-scrolling live Norwegian transcript, participant turn indicators, and manual discussion conclusion (`END_DISCUSSION` DataPacket) in `HUMAN_LOCAL` mode.
  - `ExamResultsScreen.tsx`: Polling results dashboard displaying CEFR pass/fail badges, 4 HK-dir criteria breakdowns (1–10 scale), bilingual feedback, concrete before/after corrections with grammatical explanations, dual-candidate tab switching, and infrastructure usage & cost metrics drawer.
- **LiveKit Voice Agent Worker (`src/agent/worker.ts`)**: Built with `@livekit/agents` (v1.x) Node.js TypeScript SDK.
  - **Prewarm VAD**: Silero VAD (`minSilenceDuration: 0.9s`) to prevent interrupting second-language learners during thinking pauses.
  - **STT**: Deepgram Nova-3 with Norwegian (`no`) language support, smart formatting, filler words, and speaker diarization.
  - **LLM**: OpenAI `gpt-4.1-mini` for conversational exam turns.
  - **TTS**: ElevenLabs Flash v2.5 (`eleven_flash_v2_5`) with distinct voices for examiner sensor and peer co-candidate.
- **Dual-Persona Agent Orchestration**:
  - `ExaminerAgent`: Official HK-dir examiner sensor guiding the candidate through Del 1 (monologue), Del 2 (discussion introduction), and Del 3 (follow-up questions).
  - `CoCandidateAgent`: Natural spoken Norwegian peer candidate roleplaying 5–6 debate turns before handing back to the examiner.
- **Passive Moderator Mode (`HUMAN_LOCAL`)**: Disables automatic AI turn replies (`session.pauseReplyAuthorization()`) so two candidates sharing one microphone can debate uninterrupted for up to 3 minutes or until an `END_DISCUSSION` data packet is received.
- **Zero-Webhook Direct Neon Persistence**: On session shutdown, the worker writes directly to Neon PostgreSQL in an atomic Drizzle ORM transaction and triggers post-exam grading (`evaluateExamSession`) without HTTP webhooks.
- **Post-Exam CEFR Rubric Grading (`src/lib/evaluate-exam.ts`)**: Scores candidate performance against 4 HK-dir criteria (Formidling & flyt, Uttale & forståelighet, Ordforråd, Grammatikk & setningsstruktur) using OpenAI `gpt-4o` with fallback evaluation.

---

## Local Run Sequence & Quickstart

To run the complete system locally, follow this exact sequence:

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Environment Configuration
Create or configure `.env.local` in the project root:
```env
# LiveKit Cloud Credentials
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret

# AI Providers
OPENAI_API_KEY=sk-your-openai-api-key
DEEPGRAM_API_KEY=your-deepgram-api-key
ELEVEN_API_KEY=your-elevenlabs-api-key
ELEVEN_EXAMINER_VOICE_ID=voice_id_examiner
ELEVEN_COCANDIDATE_VOICE_ID=voice_id_cocandidate

# Neon Serverless PostgreSQL
DATABASE_URL=postgresql://user:password@ep-sample-pooler.eu-central-1.aws.neon.tech/norsk_app?sslmode=require
DIRECT_DATABASE_URL=postgresql://user:password@ep-sample.eu-central-1.aws.neon.tech/norsk_app?sslmode=require
```

### Step 3: Synchronize and Seed the Database
Push the Drizzle ORM schema to Neon and seed the official HK-dir B1/B2 topics and test candidate quota:
```bash
# 1. Push schema tables and enums to PostgreSQL
npm run db:push

# 2. Seed official topics (2x B1, 2x B2) and candidate test quota
npm run db:seed
```

### Step 4: Pre-download Voice Agent Model Files
Download the required Silero VAD and on-device model weights:
```bash
npm run agent:download-files
```

### Step 5: Start the Next.js 15 Control Plane API
Start the Next.js API server (Terminal 1):
```bash
npm run dev
```
The API is available at `http://localhost:3000`. Test the topics endpoint:
```bash
curl http://localhost:3000/api/exam/topics?userId=candidate_test_1
```

### Step 6: Start the LiveKit Voice Agent Worker
Start the real-time voice agent worker (Terminal 2):
```bash
# Development mode with hot-reload:
npm run agent:dev

# Or production mode:
npm run agent:start
```
The worker registers with your LiveKit Cloud instance and listens for incoming exam rooms matching `exam_*`.

### Step 7: Run Automated Verification Tests
Execute the end-to-end test suite (Terminal 3):
```bash
npm test
```
All 29 tests verify the voice worker, schema, API endpoints, evaluation engine, and screen results.

---

## Repository Structure

```
├── app/                        # Next.js 15 App Router Endpoints
│   ├── api/exam/topics/        # GET: HK-dir topics catalog & user quota
│   ├── api/exam/start/         # POST: Validate quota, create room, mint token
│   ├── api/exam/[sessionId]/   # GET: Session status & transcript
│   ├── api/exam/[sessionId]/results/ # GET: Polling results & CEFR report
│   └── api/quota/              # GET/POST: User practice seconds management
├── docs/                       # Comprehensive System Documentation
│   ├── README.md               # Documentation guide & tech stack
│   ├── ARCHITECTURE.md         # Architecture, topology & sequence flows
│   ├── DEVELOPMENT_GUIDE.md    # Local setup, run sequence & contribution
│   ├── LIVEKIT_VOICE_AGENT.md  # Voice agent worker deep dive
│   ├── DATABASE_SCHEMA.md      # Drizzle tables, indexes & relations
│   ├── API_REFERENCE.md        # Next.js API endpoints specification
│   ├── BILLING_AND_USAGE.md    # Pricing formulas & atomic quota deductions
│   └── EXAM_RUBRIC_EVALUATION.md# HK-dir CEFR rubric scoring criteria
├── drizzle/                    # Drizzle ORM SQL migration snapshots
├── lib/                        # Core utilities & domain logic
│   ├── auth.ts                 # Bearer token & header authentication
│   ├── cost-calculator.ts      # Multi-provider cost calculation formulas
│   ├── evaluation.ts           # Asynchronous rubric evaluation utilities
│   └── topics.ts               # Official B1/B2 oral exam topic catalog
├── src/                        # Full-Stack Application Modules
│   ├── agent/worker.ts         # LiveKit Voice Agent Worker (Examiner + Co-Candidate)
│   ├── db/                     # Database client & schema definitions
│   │   ├── index.ts            # Shared Neon PostgreSQL client with .env.local loader
│   │   ├── schema.ts           # exam_topics, user_quotas, exam_sessions, usage_ledger
│   │   └── seed.ts             # HK-dir topic catalog & candidate quota seed script
│   ├── lib/evaluate-exam.ts    # Direct post-exam CEFR evaluator (OpenAI gpt-4o)
│   ├── screens/                # React Native Client Mobile Screens
│   │   ├── ExamSetupScreen.tsx # Screen 1: Topic, level, mode, and audio setup
│   │   ├── ExamRoomScreen.tsx  # Screen 2: Real-time LiveKit exam room with dual personas
│   │   └── ExamResultsScreen.tsx # Screen 3: Post-exam results, rubric scores & corrections
│   └── types/exam.ts           # Unified TypeScript domain & navigation types
└── tests/                      # Automated Test Suite (29 tests)
    ├── agent-worker.test.ts    # LiveKit worker initialization & metadata parsing
    ├── api-routes.test.ts      # Next.js route handlers integration tests
    ├── control-plane.test.ts   # Quota threshold, tokens, and cost formulas
    ├── db-schema.test.ts       # Drizzle schema, indexes, and seed validation
    ├── evaluate-exam.test.ts   # Rubric schema validation & offline evaluation
    └── exam-results.test.ts    # Polling, dual-candidate tabs & metric calculation
```

---

## Documentation Index

For detailed specifications, consult the documents in the [`docs/`](./docs/README.md) directory:
- [1. Architecture & System Flow](./docs/ARCHITECTURE.md)
- [2. Local Development & Run Sequence Guide](./docs/DEVELOPMENT_GUIDE.md)
- [3. LiveKit Voice Agent Worker Guide](./docs/LIVEKIT_VOICE_AGENT.md)
- [4. Database Schema & Models](./docs/DATABASE_SCHEMA.md)
- [5. API Reference Specification](./docs/API_REFERENCE.md)
- [6. Billing, Costs & Quota Ledger](./docs/BILLING_AND_USAGE.md)
- [7. HK-dir B1/B2 Rubric Evaluation Engine](./docs/EXAM_RUBRIC_EVALUATION.md)

