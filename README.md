# Norskprøven Muntlig B1/B2 Practice Simulator
**Next.js 16 Turn-Based Voice Pipeline & Expo Go Mobile Client**

This repository contains the full-stack infrastructure and cross-platform mobile client for the **Norskprøven Muntlig B1/B2 Oral Exam Simulator**. It simulates the official Norwegian Directorate for Higher Education and Skills (**HK-dir**) oral examination through a deterministic exam state machine (`DEL1_MONOLOGUE` → `DEL2_AI` / `DEL2_HUMAN` → `DEL3` → `DONE`), dual AI personas (Examiner Sensor + Peer Co-Candidate), OpenAI speech-to-text & conversational LLM, ElevenLabs text-to-speech, automated CEFR rubric grading, and an **Expo Go**-compatible mobile & web client.

---

## Architecture & System Highlights

- **Web Admin Portal (`app/admin/page.tsx`, `app/api/admin/exams/**`)**:
  - Secure web-only portal at `/admin` (protected by `ADMIN_SECRET`) for administrators to view, create, edit, toggle active status, and delete B1/B2 oral exams and their Del 3 question pools.
  - Generates URL-safe Norwegian slugs (handling `æ`, `ø`, `å`) and tracks historical session usage per exam.
- **Random Exam & Question Pool Selection (`src/server/exam-randomizer.ts`)**:
  - Every time a candidate starts an exam (defaulting to *"Tilfeldig prøve"*), the backend randomly draws an active exam matching their CEFR level and draws up to 3 random Del 3 follow-up questions from that exam's pool, persisting the chosen question set directly on the session.
- **Expo Go & Web Mobile Client (`src/screens/*`, `src/hooks/useExamTurns.ts`)**:
  - Runs directly inside standard **Expo Go** on physical phones, Android emulators, and web browsers (`expo start --web`) using `expo-audio` — no native WebRTC prebuilds or custom dev clients required.
  - `ExamSetupScreen.tsx`: CEFR level selection (B1 / B2), random exam drawing (default) with optional manual topic override, exam mode selection (`AI_PEER` vs `HUMAN_LOCAL`), real-time quota verification, and session initialization.
  - `ExamRoomScreen.tsx`: Interactive oral exam room with stage banner (`Del 1: Presentasjon`, `Del 2: Samtale med medkandidat`, `Del 3: Oppfølgingsspørsmål`), active speaker cards (Sensor, Kandidat, Medkandidat), live transcript, tap-to-talk + automatic silence detection (~2.6s via `expo-audio` metering), skip/finish controls, and manual discussion conclusion in `HUMAN_LOCAL` mode.
  - `ExamResultsScreen.tsx`: Polling results dashboard displaying CEFR pass/fail badges, 4 HK-dir criteria breakdowns (1–10 scale), bilingual feedback, concrete before/after Norwegian corrections with grammatical explanations, dual-candidate tab switching, and infrastructure usage & cost metrics drawer.
- **Deterministic Turn-Based Voice Pipeline (`src/server/*`)**:
  - `src/server/exam-engine.ts`: Pure deterministic state machine orchestrating `DEL1_MONOLOGUE`, `DEL2_AI` (5 debate turns with AI co-candidate), `DEL2_HUMAN` (local partner discussion), `DEL3` (follow-up questions from session question set), and `DONE`.
  - `src/server/personas.ts`: Builds Examiner and AI Co-Candidate system prompts tailored to B1/B2 CEFR targets and generates concise spoken Norwegian responses via `gpt-4.1-mini`.
  - `src/server/speech.ts`: Transcribes candidate audio via OpenAI `/v1/audio/transcriptions` (`gpt-4o-transcribe`, `language: 'no'`) and streams synthesized speech via ElevenLabs (`eleven_multilingual_v2`) with automatic OpenAI `gpt-4o-mini-tts` fallback.
- **Post-Exam CEFR Rubric Grading (`src/lib/evaluate-exam.ts`)**:
  - Scores candidate performance against 4 official HK-dir criteria (*Formidling & flyt*, *Uttale & forståelighet*, *Ordforråd*, *Grammatikk & setningsstruktur*) using OpenAI `gpt-4o` scheduled via Next.js `after()`, evaluating the candidate against the exact Del 1 monologue, Del 2 discussion, and randomly chosen Del 3 follow-up questions for their session.

---

## Quickstart (2 Terminals or Single Command)

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment (`.env.local`)
Copy `.env.example` to `.env.local` and configure your credentials:
```env
# AI Providers
OPENAI_API_KEY=sk-your-openai-api-key
ELEVEN_API_KEY=your-elevenlabs-api-key
ELEVEN_EXAMINER_VOICE_ID=21m00Tcm4TlvDq8ikWAM
ELEVEN_COCANDIDATE_VOICE_ID=AZnzlk1XvdvUeBnXmlld
ELEVEN_MODEL_ID=eleven_multilingual_v2

# Neon Serverless PostgreSQL
DATABASE_URL=postgresql://user:password@ep-sample-pooler.eu-central-1.aws.neon.tech/norsk_app?sslmode=require
DIRECT_DATABASE_URL=postgresql://user:password@ep-sample.eu-central-1.aws.neon.tech/norsk_app?sslmode=require
```
*(Note: Leave `EXPO_PUBLIC_API_URL` unset in `.env.local` so `src/config.ts` automatically resolves your LAN IP for physical phones on Wi-Fi, `10.0.2.2:3000` for Android Emulator, and `localhost:3000` for Web.)*

### Step 3: Synchronize and Seed the Database
```bash
npm run db:seed
```

### Step 4: Start Backend & Expo (Single Command or 2 Terminals)
Run both the Next.js API server (bound to `0.0.0.0:3000`) and Expo simultaneously:
```bash
npm run dev:all
```
Or in two separate terminals:
```bash
# Terminal 1: Next.js API Control Plane
npm run dev

# Terminal 2: Expo Metro Bundler
npm run mobile:start
```
- **Physical Phone**: Scan the QR code with the **Expo Go** app (ensure phone and PC are on the same Wi-Fi network).
- **Android Emulator**: Press `a` in the Expo terminal.
- **Web Browser**: Run `npm run mobile:web` or press `w` in the Expo terminal.

### Step 5: Run Automated Verification Tests
```bash
npm test
```

---

## Repository Structure

```
├── app/                                       # Next.js 16 App Router Endpoints
│   ├── api/exam/topics/                       # GET: HK-dir topics catalog & user quota
│   ├── api/exam/start/                        # POST: Validate quota, init session & greeting
│   ├── api/exam/[sessionId]/                  # GET: Session status & transcript
│   ├── api/exam/[sessionId]/turn/             # POST: Audio STT -> exam engine -> LLM replies
│   ├── api/exam/[sessionId]/speech/[turnIndex]/ # GET: Stream TTS audio/mpeg for a turn
│   ├── api/exam/[sessionId]/finish/           # POST: Finalize session, ledger & trigger eval
│   ├── api/exam/[sessionId]/results/          # GET: Polling results & CEFR report
│   └── api/quota/                             # GET/POST: User practice seconds management
├── proxy.ts                                   # Next.js 16 CORS proxy for /api/*
├── docs/                                      # Comprehensive System Documentation
├── lib/                                       # Shared utilities
│   ├── auth.ts                                # Bearer token & header authentication
│   └── cost-calculator.ts                     # Multi-provider cost calculation formulas
├── src/                                       # Full-Stack Application Modules
│   ├── config.ts                              # Auto-detected API base URL for LAN/Emulator/Web
│   ├── identity.ts                            # Persistent candidate ID via SecureStore/AsyncStorage
│   ├── api.ts                                 # Typed HTTP client & FormData audio uploader
│   ├── hooks/useExamTurns.ts                  # Turn-based expo-audio recorder & sequential player
│   ├── server/                                # Backend Exam Pipeline
│   │   ├── exam-engine.ts                     # Deterministic DEL1 -> DEL2 -> DEL3 -> DONE engine
│   │   ├── personas.ts                        # Examiner & Co-Candidate prompts & LLM generator
│   │   └── speech.ts                          # OpenAI STT & ElevenLabs/OpenAI TTS streaming
│   ├── db/                                    # Database client & schema definitions
│   │   ├── index.ts                           # Shared Neon PostgreSQL client
│   │   ├── schema.ts                          # exam_topics, user_quotas, exam_sessions, usage_ledger
│   │   └── seed.ts                            # HK-dir topic catalog & candidate quota seed script
│   ├── lib/evaluate-exam.ts                   # Post-exam CEFR evaluator (OpenAI gpt-4o)
│   ├── screens/                               # React Native Mobile Screens
│   │   ├── ExamSetupScreen.tsx                # Screen 1: Topic, level, mode, and quota check
│   │   ├── ExamRoomScreen.tsx                 # Screen 2: Turn-based oral exam room
│   │   └── ExamResultsScreen.tsx              # Screen 3: Post-exam results, rubric scores & corrections
│   └── types/exam.ts                          # Unified TypeScript domain & navigation types
└── tests/                                     # Automated Test Suite
```

---

## Documentation Index

For detailed specifications, consult the documents in [`docs/`](./docs/README.md):
- [1. Architecture & System Flow](./docs/ARCHITECTURE.md)
- [2. Local Development & Run Sequence Guide](./docs/DEVELOPMENT_GUIDE.md)
- [3. Database Schema & Models](./docs/DATABASE_SCHEMA.md)
- [4. API Reference Specification](./docs/API_REFERENCE.md)
- [5. Billing, Costs & Quota Ledger](./docs/BILLING_AND_USAGE.md)
- [6. HK-dir B1/B2 Rubric Evaluation Engine](./docs/EXAM_RUBRIC_EVALUATION.md)
