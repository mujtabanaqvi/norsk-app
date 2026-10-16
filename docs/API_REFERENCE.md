# API Reference Specification

All route handlers are implemented using the **Next.js 16 App Router** with TypeScript, **Zod** validation, and **Drizzle ORM**. Cross-origin requests from Expo Web and mobile clients are enabled via `proxy.ts`.

---

## 1. `GET /api/exam/topics`
Retrieves active HK-dir oral examination topics and fetches or initializes the user's practice audio quota (`1800` seconds for new users).

### Query Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `level` | `'B1' \| 'B2'` | No | Filter topics by CEFR level. |
| `userId` | `string` | No (if Bearer/header present) | User identifier. |

---

## 2. `POST /api/exam/start`
Validates candidate quota (`remainingAudioSeconds > 180`), selects a random active exam for the requested `level` when `topicId` is omitted or `"RANDOM"` (or looks up a specific `topicId`), randomly draws up to 3 Del 3 follow-up questions from the exam's question pool (`selectedFollowUpQuestionsNo`), creates a new `exam_sessions` row with initial `engineState` (`DEL1_MONOLOGUE`), and returns the opening Examiner greeting turn.

### Request Body
```json
{
  "level": "B1",
  "coCandidateMode": "AI_PEER",
  "topicId": "RANDOM"
}
```

### Response `201 Created`
```json
{
  "sessionId": "9c25608b-69bb-41a4-9e32-9cb5f3ce0036",
  "stage": "DEL1_MONOLOGUE",
  "done": false,
  "topic": {
    "id": "e6a2bc41-2ff2-4981-b51c-43df52b4742a",
    "titleNo": "Bør kollektivtransport være gratis for alle?",
    "monologuePromptNo": "...",
    "discussionPromptNo": "...",
    "followUpQuestionsNo": ["..."]
  },
  "transcript": [
    {
      "speaker": "Sensor",
      "role": "EXAMINER",
      "text": "Velkommen til muntlig prøve på nivå B1...",
      "timestamp": 1728200000000,
      "stage": "DEL1_MONOLOGUE"
    }
  ],
  "replies": [
    {
      "turnIndex": 0,
      "role": "EXAMINER",
      "speaker": "Sensor",
      "text": "Velkommen til muntlig prøve på nivå B1...",
      "stage": "DEL1_MONOLOGUE",
      "audioUrl": "/api/exam/9c25608b-69bb-41a4-9e32-9cb5f3ce0036/speech/0"
    }
  ]
}
```

---

## 3. `POST /api/exam/[sessionId]/turn`
Processes a candidate turn during an active exam session. Accepts either:
- `multipart/form-data` with an `audio` file (`m4a`/`webm`/`wav`), optional `durationMs`, and optional `speakerRole` (`CANDIDATE_1` or `CANDIDATE_2`).
- `application/json` with `{ "endDiscussion": true }` (to transition from `DEL2_HUMAN` to `DEL3`) or `{ "textOverride": "..." }` (for skipping or testing).

### Response `200 OK`
```json
{
  "sessionId": "9c25608b-69bb-41a4-9e32-9cb5f3ce0036",
  "stage": "DEL2_AI",
  "done": false,
  "userTranscript": "Jeg reiser vanligvis med buss til jobb hver dag...",
  "replies": [
    {
      "turnIndex": 2,
      "role": "EXAMINER",
      "speaker": "Sensor",
      "text": "Takk for presentasjonen. Nå går vi videre til del 2...",
      "stage": "DEL2_AI",
      "audioUrl": "/api/exam/9c25608b-69bb-41a4-9e32-9cb5f3ce0036/speech/2"
    },
    {
      "turnIndex": 3,
      "role": "AI_CO_CANDIDATE",
      "speaker": "Medkandidat (AI)",
      "text": "Jeg synes gratis kollektivtransport høres bra ut...",
      "stage": "DEL2_AI",
      "audioUrl": "/api/exam/9c25608b-69bb-41a4-9e32-9cb5f3ce0036/speech/3"
    }
  ],
  "transcript": [ ... ]
}
```

---

## 4. `GET /api/exam/[sessionId]/speech/[turnIndex]`
Streams synthesized `audio/mpeg` for the specified transcript entry index (`turnIndex`) using ElevenLabs (`eleven_multilingual_v2`) with automatic fallback to OpenAI `gpt-4o-mini-tts`. Uses role-specific voices (`EXAMINER` vs `AI_CO_CANDIDATE`).

---

## 5. `POST /api/exam/[sessionId]/finish`
Finalizes an exam session, writes an atomic transaction to `exam_sessions`, `usage_ledger`, and `user_quotas`, and schedules `evaluateExamSession(sessionId)` via Next.js `after()`. Idempotent if called on an already-completed session.

### Response `200 OK`
```json
{
  "status": "COMPLETED",
  "sessionId": "9c25608b-69bb-41a4-9e32-9cb5f3ce0036",
  "alreadyCompleted": false
}
```

---

## 6. `GET /api/exam/[sessionId]/results`
Polled by `ExamResultsScreen` every 3 seconds until `status === 'COMPLETED'` and `evaluationJson` is populated by the post-exam GPT-4o rubric evaluator.

---

## 7. `GET /api/quota` & `POST /api/quota`
Queries or tops up the candidate's remaining practice seconds (`remainingAudioSeconds`).

---

## 8. Web Admin Portal Endpoints (`/api/admin/exams`)
Protected by the `x-admin-secret` header (checked against `process.env.ADMIN_SECRET`, defaulting to `admin123` in local development). Powers the Next.js Web Admin Portal at `/admin`.

- **`GET /api/admin/exams`**: Lists all exams (`exam_topics`) ordered by `createdAt` DESC with `sessionCount`.
- **`POST /api/admin/exams`**: Creates a new exam with `titleNo`, `level` (`'B1' | 'B2'`), `monologuePromptNo` (Del 1), `discussionPromptNo` (Del 2), `followUpQuestionsNo` (Del 3 question pool array), and `isActive`.
- **`PATCH /api/admin/exams/[id]`**: Updates exam prompts, question pool, level, title, or `isActive` status.
- **`DELETE /api/admin/exams/[id]`**: Unlinks historical sessions and deletes the exam topic row.

