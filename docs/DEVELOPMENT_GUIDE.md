# Developer & Contributor Guide

This guide describes how to configure, run, test, and contribute to the **Norskprøven Muntlig B1/B2 Practice Simulator**.

---

## 1. Prerequisites

Before running the application locally, ensure you have:
- **Node.js**: v20.x or later (v22 recommended).
- **Package Manager**: `npm` (v10+).
- **PostgreSQL**: Neon Serverless PostgreSQL instance (or local PostgreSQL 15+).
- **LiveKit Cloud**: Account and project credentials (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`).
- **AI Provider Credentials**:
  - **OpenAI**: API key with access to `gpt-4.1-mini` and `gpt-4o`.
  - **Deepgram**: API key for Nova-3 Norwegian speech recognition.
  - **ElevenLabs**: API key and Voice IDs for examiner sensor and peer candidate.

---

## 2. Environment Variables Configuration

Create a `.env.local` file in the root directory:

```env
# -------------------------------------------------------------
# 1. LiveKit Cloud Configuration
# -------------------------------------------------------------
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret

# -------------------------------------------------------------
# 2. AI Provider Credentials
# -------------------------------------------------------------
OPENAI_API_KEY=sk-your-openai-api-key
DEEPGRAM_API_KEY=your-deepgram-api-key
ELEVEN_API_KEY=your-elevenlabs-api-key
ELEVEN_EXAMINER_VOICE_ID=voice_id_examiner
ELEVEN_COCANDIDATE_VOICE_ID=voice_id_cocandidate

# -------------------------------------------------------------
# 3. PostgreSQL Database Connection (Neon Serverless)
# -------------------------------------------------------------
# Pooled connection string (for Next.js serverless route handlers)
DATABASE_URL=postgresql://user:password@ep-sample-pooler.eu-central-1.aws.neon.tech/norsk_app?sslmode=require

# Direct connection string (for Drizzle migrations & DDL operations)
DIRECT_DATABASE_URL=postgresql://user:password@ep-sample.eu-central-1.aws.neon.tech/norsk_app?sslmode=require

# -------------------------------------------------------------
# 4. Optional Mobile Client Configuration
# -------------------------------------------------------------
EXPO_PUBLIC_API_URL=http://localhost:3000
```

---

## 3. Step-by-Step Local Run Sequence

To start the simulator locally, follow this exact sequence:

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Push Database Schema
Push the Drizzle ORM schema (`src/db/schema.ts`) to your PostgreSQL database:
```bash
npm run db:push
```
*Note: This creates the enum types (`cefr_level`, `co_candidate_mode`, `session_status`, `usage_source`) and tables (`exam_topics`, `user_quotas`, `exam_sessions`, `usage_ledger`).*

### Step 3: Seed Database Topics & Candidate Quota
Seed official HK-dir B1 and B2 exam topics and create an initial test user with 1800 seconds (30 minutes) of practice quota:
```bash
npm run db:seed
```
*Output validates 4 topics seeded (2 B1, 2 B2) and test user `test-user-uuid` initialized.*

### Step 4: Download Voice Agent Model Assets
Pre-download the on-device Silero VAD weights required by `@livekit/agents`:
```bash
npm run agent:download-files
```

### Step 5: Start the Next.js Control Plane API Server
In **Terminal 1**, start the Next.js API server:
```bash
npm run dev
```
The server starts on `http://localhost:3000`. You can verify it by requesting topics:
```bash
curl http://localhost:3000/api/exam/topics?userId=test-user-uuid
```

### Step 6: Start the LiveKit Voice Agent Worker
In **Terminal 2**, start the agent worker:
```bash
# Development mode with hot-reloading:
npm run agent:dev

# Or production mode:
npm run agent:start
```
The worker connects to LiveKit Cloud via WebRTC and listens for incoming rooms prefixed with `exam_*`.

### Step 7: Run Automated Verification Tests
In **Terminal 3**, run the automated test suite to verify end-to-end functionality:
```bash
npm test
```
All 29 tests will execute across:
- `tests/agent-worker.test.ts`: LiveKit agent initialization, VAD, and tools.
- `tests/api-routes.test.ts`: Next.js route handlers (`topics`, `start`, `results`, `quota`).
- `tests/control-plane.test.ts`: Quota thresholds, JWT token generation, and cost models.
- `tests/db-schema.test.ts`: Drizzle schema, indexes, and seed checks.
- `tests/evaluate-exam.test.ts`: HK-dir rubric evaluation and fallback handling.
- `tests/exam-results.test.ts`: Polling states, dual-candidate tabs, and metric calculation.

### Step 8: Run the Mobile Client with Expo
The React Native client screens are wired with Expo via `App.tsx` and `index.js`:
- Point `EXPO_PUBLIC_API_URL` in `.env.local` to your Next.js host:
  - `http://localhost:3000` for iOS simulator or local web.
  - `http://10.0.2.2:3000` for Android emulator.
  - `http://192.168.x.x:3000` for a physical phone on your local Wi-Fi.

In **Terminal 4**, start Expo:
```bash
npm run mobile:start
```
- Press `a` to open in Android emulator / connected device.
- Or run `npm run mobile:android` to build and launch with Expo.

---

## 4. Complete Scripts Reference

| Command | Action | Description |
| :--- | :--- | :--- |
| `npm run dev` | Next.js Dev Server | Runs Next.js 15 App Router API at `http://localhost:3000`. |
| `npm run build` | Next.js Build | Compiles production bundle and type-checks the application. |
| `npm run start` | Next.js Production | Starts the compiled production Next.js server. |
| `npm test` | Run Test Suite | Runs all tests in `tests/*.test.ts` using Node.js test runner. |
| `npm run agent:download-files` | Download VAD Weights | Fetches Silero VAD weights for `@livekit/agents`. |
| `npm run agent:dev` | Agent Worker (Dev) | Runs `src/agent/worker.ts` with `tsx watch` for auto-reloading. |
| `npm run agent:start` | Agent Worker (Prod)| Runs `src/agent/worker.ts` in production mode. |
| `npm run mobile:start` | Expo Start | Starts the Expo Metro development server with QR code. |
| `npm run mobile:android`| Expo Android Build| Builds and launches the native Android development client. |
| `npm run mobile:ios` | Expo iOS Build | Builds and launches the native iOS development client (macOS). |
| `npm run db:push` | Drizzle Push | Directly pushes `src/db/schema.ts` to PostgreSQL. |
| `npm run db:generate` | Drizzle Generate | Generates new SQL migration files in `drizzle/`. |
| `npm run db:migrate` | Drizzle Migrate | Executes pending SQL migration files. |
| `npm run db:seed` | Database Seeder | Seeds topics and default test quota into Neon. |
| `npm run db:studio` | Drizzle Studio | Launches web-based database browser at `https://local.drizzle.studio`. |

---

## 5. Development Guidelines & Invariants

### 5.1 Modifying Database Schema
1. Update `src/db/schema.ts` (this is the single source of truth defined in `drizzle.config.ts`).
2. Run `npm run db:push` or generate migrations via `npm run db:generate`.
3. If new columns affect evaluation or quota, update `src/lib/evaluate-exam.ts` and `src/agent/worker.ts`.
4. Run `npm test` to verify schema tests pass.

### 5.2 Adding or Updating HK-dir Topics
1. Add new topics to `src/db/seed.ts` or via database inserts.
2. Topics must include:
   - `slug`: unique URL-safe slug.
   - `level`: `'B1'` or `'B2'`.
   - `titleNo`: Norwegian title.
   - `monologuePromptNo`: Prompt for Del 1.
   - `discussionPromptNo`: Prompt for Del 2 debate.
   - `followUpQuestionsNo`: Array of follow-up questions for Del 3.
3. Re-run `npm run db:seed`.

### 5.3 Modifying API Endpoints
1. Handlers live under `app/api/...`.
2. Always validate inputs using **Zod**.
3. Always authenticate requests using `authenticateUser(req)` from `lib/auth.ts`.
4. Use `src/db/index.ts` and `src/db/schema.ts` for database operations.
5. Add corresponding integration tests under `tests/api-routes.test.ts`.
