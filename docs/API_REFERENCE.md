# API Reference Specification

All route handlers are implemented using the **Next.js 15 App Router** with TypeScript, strict **Zod** schema validation, and **Drizzle ORM**.

---

## 1. `GET /api/exam/topics`
Retrieves available HK-dir oral examination topics, optionally filtered by level, and fetches or initializes the user's available practice audio quota.

### Query Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `level` | `string` | No | Filter by CEFR level (`'B1'` or `'B2'`). |
| `userId` | `string` | No (if Bearer present) | User identifier (can also be passed in `Authorization` header or `x-user-id`). |

### Headers
| Header | Value | Required | Description |
| :--- | :--- | :--- | :--- |
| `Authorization` | `Bearer <user_token>` | Optional | Bearer token containing user ID. |
| `x-user-id` | `<user_id>` | Optional | Fallback header for user ID identification. |

### Response `200 OK`
```json
{
  "topics": [
    {
      "id": "e6a2bc41-2ff2-4981-b51c-43df52b4742a",
      "slug": "kollektivtransport-gratis",
      "titleNo": "Bør kollektivtransport være gratis for alle?",
      "level": "B1",
      "monologuePromptNo": "Fortell om hvordan du reiser til daglig. Hva er fordelene og ulempene med buss, tog og bil der du bor?",
      "discussionPromptNo": "Diskuter om kollektivtransport bør finansieres over skatteseddelen og være helt gratis for alle innbyggere.",
      "followUpQuestionsNo": [
        "Hva tenker du om miljøaspektet ved økt kollektivbruk?",
        "Hvem bør betale hvis billettene blir gratis?",
        "Hvordan kan kollektivtilbudet i distriktene forbedres?"
      ],
      "isActive": true,
      "createdAt": "2026-10-06T12:00:00.000Z"
    }
  ],
  "quota": {
    "remainingAudioSeconds": 1800,
    "totalCostUsd": "0.000000"
  }
}
```

### Error Responses
- **`400 Bad Request`**: Invalid `level` parameter (`"Invalid level query parameter. Must be 'B1' or 'B2'."`).
- **`401 Unauthorized`**: No user identifier could be extracted from auth, headers, or query params.

---

## 2. `POST /api/exam/start`
Validates candidate quota, creates a new exam session record in PostgreSQL, creates a LiveKit room, and mints a WebRTC participant access token.

### Headers
| Header | Value | Required | Description |
| :--- | :--- | :--- | :--- |
| `Authorization` | `Bearer <user_token>` | Yes | User authentication token or user ID. |
| `Content-Type` | `application/json` | Yes | Request payload format. |

### Request Body
```json
{
  "level": "B1",
  "coCandidateMode": "AI_PEER",
  "topicId": "e6a2bc41-2ff2-4981-b51c-43df52b4742a"
}
```

| Field | Type | Allowed Values | Description |
| :--- | :--- | :--- | :--- |
| `level` | `string` | `'B1'`, `'B2'` | Target CEFR level. |
| `coCandidateMode` | `string` | `'AI_PEER'`, `'HUMAN_LOCAL'` | Exam format: AI co-candidate vs. local partner. |
| `topicId` | `string` | UUID or catalog slug | Selected exam topic identifier. |

### Response `201 Created`
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "roomName": "exam_9c25608b-69bb-41a4-9e32-9cb5f3ce0036",
  "sessionId": "9c25608b-69bb-41a4-9e32-9cb5f3ce0036",
  "livekitUrl": "wss://your-project.livekit.cloud"
}
```

### Error Responses
- **`400 Bad Request`**: Payload failed Zod validation.
- **`401 Unauthorized`**: Missing or invalid Authorization credentials.
- **`402 Payment Required`**: Insufficient quota (`remainingAudioSeconds <= 180`).
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

## 3. `GET /api/exam/[sessionId]/results`
Optimized polling endpoint used by `ExamResultsScreen` to check session completion, retrieve the official HK-dir evaluation scorecard, and view provider usage metrics.

### Path Parameters
| Parameter | Type | Description |
| :--- | :--- | :--- |
| `sessionId` | `string` (UUID) | The unique session identifier. |

### Headers
| Header | Value | Required | Description |
| :--- | :--- | :--- | :--- |
| `Authorization` | `Bearer <user_token>` | Optional | If provided, verifies session belongs to user. |

### Response `200 OK` (Evaluation In Progress)
```json
{
  "status": "ACTIVE",
  "level": "B1",
  "coCandidateMode": "AI_PEER",
  "transcriptJson": [],
  "evaluationJson": null,
  "usage": [],
  "topic": { ... }
}
```

### Response `200 OK` (Evaluation Completed)
```json
{
  "status": "COMPLETED",
  "level": "B1",
  "coCandidateMode": "AI_PEER",
  "transcriptJson": [
    {
      "speaker": "Examiner",
      "role": "EXAMINER",
      "text": "Velkommen til muntlig prøve.",
      "timestamp": 1728200000000
    },
    {
      "speaker": "Kandidat",
      "role": "CANDIDATE_1",
      "text": "Takk, jeg er klar.",
      "timestamp": 1728200005000
    }
  ],
  "evaluationJson": {
    "candidates": [
      {
        "speakerRole": "CANDIDATE_1",
        "targetLevel": "B1",
        "assessedLevel": "B1",
        "passedTargetLevel": true,
        "overallSummaryNo": "Kandidaten viser tilfredsstillende muntlig kompetanse på B1-nivå...",
        "overallSummaryEn": "The candidate demonstrates satisfactory oral proficiency at B1 level...",
        "criteriaScores": {
          "formidlingOgFlyt": {
            "score": 7,
            "feedbackNo": "God flyt med naturlig turtaking.",
            "feedbackEn": "Good fluency with natural turn-taking."
          },
          "uttaleOgForstaelighet": {
            "score": 8,
            "feedbackNo": "Klar og tydelig uttale.",
            "feedbackEn": "Clear and comprehensible pronunciation."
          },
          "ordforrad": {
            "score": 7,
            "feedbackNo": "Tilstrekkelig ordforråd til å drøfte temaet.",
            "feedbackEn": "Sufficient vocabulary to discuss the topic."
          },
          "grammatikkOgSetningsstruktur": {
            "score": 6,
            "feedbackNo": "Stort sett god setningsstruktur, men noen V2-feil.",
            "feedbackEn": "Generally good structure with minor V2 errors."
          }
        },
        "concreteCorrections": [
          {
            "originalQuote": "I går jeg dro til byen...",
            "correctedNorwegian": "I går dro jeg til byen...",
            "grammarOrVocabRule": "V2-regelen: Verbet må stå på andreplass etter foranstilt adverbial."
          }
        ]
      }
    ],
    "evaluatedAt": "2026-10-06T18:30:00.000Z"
  },
  "usage": [
    {
      "id": "c1f73449-3bc6-407b-8919-74d3fb060411",
      "sessionId": "9c25608b-69bb-41a4-9e32-9cb5f3ce0036",
      "userId": "user_12345",
      "source": "REALTIME_VOICE_AGENT",
      "llmModel": "gpt-4.1-mini",
      "llmPromptTokens": 4200,
      "llmCompletionTokens": 850,
      "ttsCharacters": 2100,
      "sttAudioSeconds": "185.50",
      "estimatedCostUsd": "0.174200",
      "createdAt": "2026-10-06T18:28:00.000Z"
    },
    {
      "id": "e2a91234-4bc7-417b-9919-84d3fb060422",
      "sessionId": "9c25608b-69bb-41a4-9e32-9cb5f3ce0036",
      "userId": "user_12345",
      "source": "POST_EXAM_RUBRIC_EVAL",
      "llmModel": "gpt-4o",
      "llmPromptTokens": 1800,
      "llmCompletionTokens": 650,
      "ttsCharacters": 0,
      "sttAudioSeconds": "0.00",
      "estimatedCostUsd": "0.012500",
      "createdAt": "2026-10-06T18:30:00.000Z"
    }
  ],
  "topic": {
    "titleNo": "Bør kollektivtransport være gratis for alle?",
    "monologuePromptNo": "...",
    "discussionPromptNo": "..."
  }
}
```

### Error Responses
- **`400 Bad Request`**: Missing or invalid UUID format for `sessionId`.
- **`403 Forbidden`**: User token does not match the session owner.
- **`404 Not Found`**: Session does not exist.

---

## 4. `GET /api/exam/[sessionId]`
Session inspection endpoint returning session state, transcript, topic, and timestamp metadata.

### Response `200 OK`
```json
{
  "id": "9c25608b-69bb-41a4-9e32-9cb5f3ce0036",
  "userId": "user_12345",
  "level": "B1",
  "coCandidateMode": "AI_PEER",
  "topicId": "e6a2bc41-2ff2-4981-b51c-43df52b4742a",
  "topicTitle": "Bør kollektivtransport være gratis for alle?",
  "topic": { ... },
  "status": "COMPLETED",
  "transcript": [ ... ],
  "evaluation": { ... },
  "startedAt": "2026-10-06T18:20:00.000Z",
  "completedAt": "2026-10-06T18:28:00.000Z"
}
```

---

## 5. `GET /api/quota` & `POST /api/quota`

### `GET /api/quota`
Returns remaining audio seconds and cumulative consumption metrics for the authenticated user.

```json
{
  "userId": "user_12345",
  "remainingSeconds": 1800,
  "totalTokensUsed": 6050,
  "totalCostUsd": "0.186700",
  "hasSufficientQuotaForExam": true
}
```

### `POST /api/quota`
Tops up user audio seconds (e.g. after In-App Purchase event).

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
  "remainingSeconds": 2700
}
```
