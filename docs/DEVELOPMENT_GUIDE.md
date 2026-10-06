# Developer & Contributor Guide

This guide describes how to run the project locally, execute automated tests, add new features, and maintain database schema consistency.

---

## 1. Environment Variables Configuration

Create a `.env.local` file based on `.env.example`:

```bash
# LiveKit Cloud Configuration
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxx

# AI Providers (Agent Worker + Next.js Rubric Evaluator)
DEEPGRAM_API_KEY=dg_xxxxxxx
ELEVEN_API_KEY=el_xxxxxxx
ELEVEN_EXAMINER_VOICE_ID=voice_id_1
ELEVEN_COCANDIDATE_VOICE_ID=voice_id_2
OPENAI_API_KEY=sk-xxxxxxx

# Internal Webhook Security (LiveKit Agent -> Next.js Usage Sync)
NextJS_CONTROL_PLANE_URL=http://localhost:3000
AGENT_WEBHOOK_SECRET=super_secret_shared_token

# PostgreSQL Connection String
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/norsk_app
```

---

## 2. Common Scripts

| Command | Action |
| :--- | :--- |
| `npm run dev` | Starts local Next.js development server at `http://localhost:3000`. |
| `npm run build` | Compiles Next.js production build and validates all TypeScript types. |
| `npm run start` | Serves the compiled production build. |
| `npm test` | Runs the full unit test suite (control plane + voice agent worker tests). |
| `npm run agent:dev` | Starts LiveKit Voice Agent worker in watch/dev mode (`src/agent/worker.ts`). |
| `npm run agent:start` | Runs LiveKit Voice Agent worker in production mode. |
| `npm run agent:download-files` | Pre-downloads required LiveKit model files. |
| `npm run db:generate` | Inspects `db/schema.ts` and outputs a new SQL migration file to `drizzle/`. |
| `npm run db:migrate` | Executes pending migrations against PostgreSQL. |
| `npm run db:push` | Directly pushes schema changes into PostgreSQL (dev convenience). |

---

## 3. How to Implement Common Changes

### 3.1 Adding a New Exam Topic
1. Open [`lib/topics.ts`](../lib/topics.ts).
2. Add your topic to `TOPIC_CATALOG`:
   ```typescript
   'nytt-tema-id': {
     id: 'nytt-tema-id',
     level: 'B1', // or 'B2'
     title: 'Norsk Tittel på Temaet',
     topicPrompt: 'Detaljert instruks til LiveKit-agenten og kandidaten...',
     instructionsNo: 'Instruks om turtaking og tidsramme...',
     keyDiscussionPoints: [
       'Punkt 1...',
       'Punkt 2...',
     ],
   }
   ```
3. Test resolution using the topic test in `tests/control-plane.test.ts`.

### 3.2 Modifying the Database Schema
1. Edit [`db/schema.ts`](../db/schema.ts).
2. Run migration generator:
   ```bash
   npm run db:generate
   ```
3. Check the generated SQL in `drizzle/` to verify foreign keys and indexes.
4. Run `npx tsc --noEmit` to verify type safety across all route handlers.

### 3.3 Adding a New API Route
1. Create a route handler under `app/api/<your-route>/route.ts`.
2. Always validate input payloads using **Zod**.
3. Authenticate requests using `authenticateUser(req)` from `lib/auth.ts`.
4. Wrap multiple write operations in `db.transaction()` for atomic guarantees.
5. Add test coverage in `tests/`.

---

## 4. Checklist for Future Feature Requests
When starting a new feature:
1. Consult [`docs/README.md`](./README.md) and [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md).
2. If changing database columns or tables, update [`db/schema.ts`](../db/schema.ts) and run `npm run db:generate`.
3. If changing API routes or request formats, update [`docs/API_REFERENCE.md`](./API_REFERENCE.md).
4. Run `npx tsx --test tests/control-plane.test.ts` to ensure zero regressions.
5. Run `npx tsc --noEmit` and `npm run build` before completing the task.

