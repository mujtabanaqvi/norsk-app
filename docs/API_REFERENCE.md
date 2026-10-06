# API Reference

All routes are built on the **Next.js 15 App Router** using TypeScript and strict **Zod** validation.

---

## 1. `POST /api/exam/start`
Starts a new oral exam session, verifies candidate quota, inserts a session row, creates a LiveKit room, and mints a participant access token.

### Headers
| Header | Value | Required | Description |
| :--- | :--- | :--- | :--- |
| `Authorization` | `Bearer <user_token>` | Yes | User authentication token or user identifier. |
| `Content-Type` | `application/json` | Yes | Request payload format. |

### Request Body
```json
{
  "level": "B1",
  "coCandidateMode": "AI_PEER",
  "topicId": "kollektivtransport-gratis"
}
```

| Field | Type | Allowed Values | Description |
| :--- | :--- | :--- | :--- |
| `level` | `string` | `'B1'`, `'B2'` | Target CEFR Norwegian level. |
| `coCandidateMode` | `string` | `'AI_PEER'`, `'HUMAN_LOCAL'` | Exam format: AI co-candidate vs. local peer. |
| `topicId` | `string` | Non-empty string | Topic identifier (e.g., `'kollektivtransport-gratis'`). |

### Response `201 Created`
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "roomName": "exam_9c25608b-69bb-41a4-9e32-9cb5f3ce0036",
  "sessionId": "9c25608b-69bb-41a4-9e32-9cb5f3ce0036",
  "livekitUrl": "wss://norsk-muntlig-simulator-95wyooxm.livekit.cloud"
}
```

### Error Responses
- **`400 Bad Request`**: Validation error (missing or invalid fields).
  ```json
  {
    "error": "Validation failed",
    "issues": { "level": ["Level must be either 'B1' or 'B2'"] }
  }
  ```
- **`401 Unauthorized`**: Missing or invalid Authorization credentials.
- **`402 Payment Required`**: Insufficient quota (`remainingSeconds <= 180`).
  ```json
  {
    "error": "Payment Required",
    "message": "Insufficient remaining time quota. A minimum of 180 seconds is required to start a practice exam session.",
    "code": "INSUFFICIENT_QUOTA",
    "remainingSeconds": 90,
    "minimumRequiredSeconds": 180
  }
  ```

---

## 2. `POST /api/webhooks/agent-complete`
Webhook triggered by the LiveKit Agent Worker when an oral practice session concludes. Atomically logs usage metrics, debits seconds, saves the transcript, marks the session as `COMPLETED`, and triggers rubric evaluation.

### Headers
| Header | Value | Required | Description |
| :--- | :--- | :--- | :--- |
| `Authorization` | `Bearer ${process.env.AGENT_WEBHOOK_SECRET}` | Yes | Shared internal worker secret. |
| `Content-Type` | `application/json` | Yes | Request payload format. |

### Request Body
```json
{
  "sessionId": "9c25608b-69bb-41a4-9e32-9cb5f3ce0036",
  "userId": "user_12345",
  "usage": {
    "llmPromptTokens": 8450,
    "llmCompletionTokens": 1920,
    "ttsCharacters": 3410,
    "sttAudioSeconds": 245.8
  },
  "transcript": [
    {
      "speaker": "examiner",
      "role": "examiner",
      "text": "Velkommen til muntlig prøve. I dag skal vi diskutere kollektivtransport.",
      "timestamp": 1728200000000
    },
    {
      "speaker": "candidate",
      "role": "user",
      "text": "Takk! Jeg mener at gratis kollektivtransport kan være bra for miljøet.",
      "timestamp": 1728200008500
    }
  ]
}
```

### Response `200 OK`
```json
{
  "success": true,
  "sessionId": "9c25608b-69bb-41a4-9e32-9cb5f3ce0036",
  "ledgerId": "3b12389a-0e78-43d8-aa42-4f8101683d71",
  "costBreakdown": {
    "llmCostUsd": 0.002419,
    "ttsCostUsd": 0.255750,
    "sttCostUsd": 0.017615,
    "totalEstimatedCostUsd": 0.275784
  },
  "deductedSeconds": 246
}
```

### Error Responses
- **`401 Unauthorized`**: Missing or invalid `AGENT_WEBHOOK_SECRET`.
- **`404 Not Found`**: Exam session does not exist in `exam_sessions`.
- **`400 Bad Request`**: Malformed JSON or failed Zod validation.

---

## 3. `GET /api/exam/[sessionId]`
Retrieves current session status, conversation transcript, and rubric evaluation results.

### Headers
| Header | Value | Required | Description |
| :--- | :--- | :--- | :--- |
| `Authorization` | `Bearer <user_token>` | Yes | User authentication token. |

### Response `200 OK`
```json
{
  "id": "9c25608b-69bb-41a4-9e32-9cb5f3ce0036",
  "userId": "user_12345",
  "level": "B1",
  "coCandidateMode": "AI_PEER",
  "topic": "Bør kollektivtransport være gratis for alle?",
  "status": "COMPLETED",
  "transcript": [ ... ],
  "evaluation": {
    "overallLevel": "B1",
    "passedTargetLevel": true,
    "summary": "Kandidaten uttrykker seg godt om emnet med tilfredsstillende flyt og ordforråd.",
    "criteria": {
      "uttale": { "score": 4, "levelAchieved": "B1", "feedback": "...", "evidence": [] },
      "flyt": { "score": 3, "levelAchieved": "B1", "feedback": "...", "evidence": [] },
      "ordforrad": { "score": 4, "levelAchieved": "B1", "feedback": "...", "evidence": [] },
      "grammatikk": { "score": 3, "levelAchieved": "B1", "feedback": "...", "evidence": [] },
      "sammenheng": { "score": 4, "levelAchieved": "B1", "feedback": "...", "evidence": [] }
    },
    "keyCorrections": [
      {
        "candidateSaid": "Jeg tror at...",
        "correction": "Jeg mener at...",
        "explanation": "Bruk 'mener' ved standpunkter."
      }
    ],
    "evaluatedAt": "2026-10-06T08:30:00.000Z"
  },
  "createdAt": "2026-10-06T08:20:00.000Z",
  "updatedAt": "2026-10-06T08:30:01.000Z"
}
```

---

## 4. `GET /api/quota` & `POST /api/quota`

### `GET /api/quota`
Returns remaining practice seconds and cumulative metrics for the authenticated user.

```json
{
  "userId": "user_12345",
  "remainingSeconds": 600,
  "totalTokensUsed": 10370,
  "totalCostUsd": "0.275784",
  "hasSufficientQuotaForExam": true
}
```

### `POST /api/quota`
Tops up user quota (e.g., after an In-App Purchase event).

**Request Body**:
```json
{
  "additionalSeconds": 900
}
```

**Response `200 OK`**:
```json
{
  "success": true,
  "userId": "user_12345",
  "remainingSeconds": 1500
}
```

