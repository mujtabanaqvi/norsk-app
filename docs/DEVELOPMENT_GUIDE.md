# Developer & Contributor Guide

This guide describes how to configure, run, test, and contribute to the **Norskprøven Muntlig B1/B2 Practice Simulator**.

---

## 1. Prerequisites

- **Node.js**: v20.x or later (v22 recommended).
- **Package Manager**: `npm` (v10+).
- **PostgreSQL**: Neon Serverless PostgreSQL instance.
- **AI Provider Credentials**:
  - **OpenAI / Azure AI Foundry**: Either direct OpenAI (`OPENAI_API_KEY`) or Azure AI Foundry (`AI_PROVIDER=azure`, `AZURE_OPENAI_RESOURCE_NAME`, `AZURE_OPENAI_API_KEY`, etc.). See [Azure AI Foundry Setup Guide](file:///c:/Users/syed_/source/repos/norsk-app/docs/AZURE_AI_FOUNDRY_SETUP.md) for full setup instructions.
  - **ElevenLabs**: API key and Voice IDs for Examiner Sensor and Peer Co-Candidate (optional; automatically falls back to OpenAI `gpt-4o-mini-tts` if unset).
- **Mobile Testing**: **Expo Go** app installed on iOS/Android phone, an Android Emulator, or a modern web browser.

---

## 2. Environment Variables Configuration

Create a `.env.local` file in the root directory (see `.env.example`):

```env
# 1. AI Provider Toggle ('openai' | 'azure')
AI_PROVIDER=openai

# Direct OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key

# Azure AI Foundry Configuration (used when AI_PROVIDER=azure)
# AZURE_OPENAI_RESOURCE_NAME=your-resource-name
# AZURE_OPENAI_API_KEY=your-azure-api-key
# AZURE_OPENAI_CHAT_DEPLOYMENT=gpt-4.1-mini
# AZURE_OPENAI_EVAL_DEPLOYMENT=gpt-4.1
# AZURE_OPENAI_WHISPER_DEPLOYMENT=whisper
# AZURE_OPENAI_API_VERSION=2024-10-21

# ElevenLabs Speech Synthesis
ELEVEN_API_KEY=your-elevenlabs-api-key
ELEVEN_EXAMINER_VOICE_ID=21m00Tcm4TlvDq8ikWAM
ELEVEN_COCANDIDATE_VOICE_ID=AZnzlk1XvdvUeBnXmlld
ELEVEN_MODEL_ID=eleven_multilingual_v2

# 2. PostgreSQL Database Connection (Neon Serverless)
DATABASE_URL=postgresql://user:password@ep-sample-pooler.eu-central-1.aws.neon.tech/norsk_app?sslmode=require
DIRECT_DATABASE_URL=postgresql://user:password@ep-sample.eu-central-1.aws.neon.tech/norsk_app?sslmode=require

# 3. Web Admin Portal Secret
ADMIN_SECRET=super_secret_admin_token

# 4. Optional Mobile Client Override
# Leave commented out for automatic LAN IP / Emulator / Web host detection!
# EXPO_PUBLIC_API_URL=http://192.168.1.50:3000
```

---

## 3. Step-by-Step Local Run Sequence

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Seed Database Topics & Candidate Quota
Ensure schema migrations and the 4 official HK-dir B1/B2 topics are seeded:
```bash
npm run db:seed
```

### Step 3: Start the Application
You can start both the Next.js backend (bound to `0.0.0.0:3000`) and the Expo bundler together:
```bash
npm run dev:all
```
Or run them in two terminals:
- **Terminal 1 (Next.js API Server)**:
  ```bash
  npm run dev
  ```
- **Terminal 2 (Expo Bundler)**:
  ```bash
  npm run mobile:start
  ```

### Step 4: Open on Phone, Emulator, or Web
- **Physical Phone (Expo Go)**: Make sure your phone is on the same Wi-Fi network as your computer, open **Expo Go**, and scan the QR code. `src/config.ts` automatically detects your computer's LAN IP from Expo's `hostUri` and connects to port `3000`. (If prompted by Windows Firewall on first run, allow Node.js on Private networks.)
- **Android Emulator**: Press `a` in the Expo terminal. `src/config.ts` automatically falls back to `http://10.0.2.2:3000`.
- **Web Browser (Candidate App)**: Run `npm run mobile:web` (or press `w` in the Expo terminal).
- **Web Admin Portal (Exam & Configuration Management)**: Navigate to `http://localhost:3000/admin` in your browser. Log in with the `ADMIN_SECRET` configured in `.env.local` (defaults to `admin123` in dev mode). Here you can:
  - Create, edit, activate/deactivate, and delete oral exams and their Del 3 question pools.
  - Configure daily test limits per tier (`FREE`, `STANDARD`, `PREMIUM`), monthly pricing, and planned features.
  - Configure referral bonus parameters (bonus tests per day and bonus duration days).

### Step 5: Run Automated Tests
```bash
# Run unit & component tests
npm test

# Run live Neon DB & evaluation integration tests
$env:RUN_INTEGRATION='1'; npm run test:integration
```

---

## 4. Complete Scripts Reference

| Command | Action | Description |
| :--- | :--- | :--- |
| `npm run dev` | Next.js Dev Server | Runs Next.js 16 API on `http://0.0.0.0:3000` (accessible on LAN). |
| `npm run dev:all` | Full Stack Dev | Runs `npm run dev` and `npm run mobile:start` concurrently. |
| `npm run build` | Next.js Build | Compiles production Next.js bundle and checks types. |
| `npm run mobile:start` | Expo Start | Starts the Expo Metro development server for Expo Go. |
| `npm run mobile:web` | Expo Web | Launches the mobile client in a web browser. |
| `npm test` | Run Unit Tests | Runs all unit tests in `tests/*.test.ts`. |
| `npm run test:integration` | Run Integration Tests | Runs live DB and rubric evaluation tests when `RUN_INTEGRATION=1`. |
| `npm run db:seed` | Database Seeder | Applies schema updates, seeds HK-dir topics, test quota, default tier policies, and referral settings. |
| `npm run db:generate` | Drizzle Generate | Generates versioned SQL migration files in `drizzle/`. |
| `npm run db:migrate` | Drizzle Migrate | Applies pending SQL migrations to PostgreSQL. |
| `npm run db:push` | Drizzle Push | Pushes `src/db/schema.ts` directly to PostgreSQL without generating migration files. |

