# API Reference Specification

All route handlers are implemented using the **Next.js 16 App Router** with TypeScript, **Zod** validation, and **Drizzle ORM**. Cross-origin requests from Expo Web and mobile clients are enabled via `proxy.ts`.

---

## 1. `GET /api/exam/topics`
Retrieves active exam themes (each with at least one active question set) and fetches or initializes the user's practice audio quota (`1800` seconds for new users). Prompts are not exposed before the exam starts.

```json
{
  "themes": [
    {
      "id": "…",
      "slug": "familie-og-barn",
      "titleNo": "Familie og barn",
      "descriptionNo": "Familieliv, oppvekst, barneoppdragelse og generasjoner.",
      "setCounts": { "B1": 1, "B2": 1 }
    }
  ],
  "quota": { "remainingAudioSeconds": 1800, "totalCostUsd": "0" }
}
```

### Query Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `level` | `'B1' \| 'B2'` | No | Only count/return themes with sets at this CEFR level. |
| `userId` | `string` | No (if Bearer/header present) | User identifier. |

---

## 2. `POST /api/exam/start`
Validates candidate quota (`remainingAudioSeconds > 180`), composes an exam for the requested `level`, creates a new `exam_sessions` row with initial `engineState` (`DEL1_MONOLOGUE`, plus `selectedPrompts` and `selectedFollowUpQuestionsNo`), and returns the opening Examiner greeting turn.

- **`themeId` = theme id/slug**: Del 1 and Del 2 prompts are drawn from random sets in that theme (different sets when possible), and up to 3 Del 3 follow-ups are drawn from the pooled questions of all the theme's sets.
- **`themeId` omitted or `"RANDOM"`**: like the real Norskprøven, Del 1, Del 2 and Del 3 are each drawn from a different random theme (themes are reused when fewer than 3 exist). If no sets have a theme yet, all active sets for the level are used.
- **`topicId`** (legacy, older mobile builds): a specific question set id/slug is used for all parts.

### Request Body
```json
{
  "level": "B1",
  "coCandidateMode": "AI_PEER",
  "themeId": "RANDOM"
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
  "theme": null,
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
Streams synthesized `audio/mpeg` for the specified transcript entry index (`turnIndex`). With `AI_PROVIDER=azure` it uses Azure AI Speech neural voices (`nb-NO-PernilleNeural` / `nb-NO-FinnNeural`) through the Foundry resource endpoint, with no fallback. With `AI_PROVIDER=openai` it uses ElevenLabs (`eleven_multilingual_v2`) and falls back automatically to OpenAI `gpt-4o-mini-tts`. Uses role-specific voices (`EXAMINER` vs `AI_CO_CANDIDATE`).

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

## 8. Authentication Endpoints (`/api/auth/*`)
Authentication is built with Better Auth and JWT token support for web and mobile Expo clients.

All auth errors share one shape: `{ "error": "<CODE>", "message": "<norsk tekst>", "fieldErrors"?: { "<field>": "<melding>" } }`. Validation rules live in `src/validation/auth.ts` and are shared with the app.

- **`POST /api/auth/register`**: Body `{ name, email, password, confirmPassword, referralCode? }`. Password: 8–128 chars, at least one letter and one digit. Creates the account **unverified** and emails a 6-digit code plus a verification link (Resend). Returns `{ success, requiresVerification: true, email }` — **no token**. Errors: `VALIDATION_ERROR` (400), `INVALID_REFERRAL_CODE` (400), `EMAIL_TAKEN` (409), `EMAIL_SEND_FAILED` (502, account created; client should offer resend). Re-registering an existing *unverified* email re-sends the code instead of failing.
- **`POST /api/auth/login`**: Body `{ email, password }`. Returns `{ token, user }`. Errors: `INVALID_CREDENTIALS` (401), `EMAIL_NOT_VERIFIED` (403, includes `email`; a fresh code is sent, subject to the 60 s cooldown — `retryAfterSeconds` if still cooling down).
- **`POST /api/auth/verify-email`**: Body `{ email, code }`. Verifies the 6-digit code and logs the user in: returns `{ token, user }`. Errors (400): `INVALID_CODE` (with `attemptsLeft`), `EXPIRED`, `TOO_MANY_ATTEMPTS` (after 5 wrong codes the code is invalidated).
- **`GET /api/auth/verify-email?email=&token=`**: Target of the link in the email. Verifies and renders a small HTML confirmation page; the user then logs in in the app.
- **`POST /api/auth/resend-verification`**: Body `{ email }`. Sends a new code + link if the account is pending verification. Always answers `200 { success, retryAfterSeconds }` regardless of whether the account exists; `429 RESEND_COOLDOWN` with `retryAfterSeconds` inside the 60 s cooldown.
- **`POST /api/auth/google`**: Body `{ idToken, referralCode? }`. Verifies the Google ID token against `GOOGLE_CLIENT_ID` / `GOOGLE_ANDROID_CLIENT_ID` / `GOOGLE_IOS_CLIENT_ID`, requires `email_verified`, then signs in or registers the user. New Google users are created with `email_verified = true` (no email verification step). Errors: `INVALID_GOOGLE_TOKEN` (401), `GOOGLE_EMAIL_NOT_VERIFIED` (403).
- **`POST /api/auth/apple`**: Extensible Apple OAuth identity token verification endpoint.
- **`GET /api/auth/me`**: Returns the profile, subscription tier, `iapAccountToken`, `activeSubscriptionProvider` (`STRIPE` | `APPLE` | `GOOGLE` | `null`), referral code, and earned referral statistics of the currently authenticated user.

---

## 9. Subscription & Tier Endpoints
- **`GET /api/config/tiers`**: Public endpoint returning all tier policies (`FREE`, `STANDARD`, `PREMIUM`) including daily test limits, monthly pricing, and feature arrays.
See [PAYMENTS.md](./PAYMENTS.md) for the full flow per platform.
- **`POST /api/stripe/checkout`** (web): Body `{ tier, successUrl?, cancelUrl?, locale? }`. Creates a Stripe Checkout session. Return URLs must be on the request origin or `NEXT_PUBLIC_APP_URL`. `409 MANAGED_BY_OTHER_PROVIDER` if the user already subscribes through the App Store / Play.
- **`GET /api/stripe/checkout/session?session_id=`** (web): Returns `{ status: 'paid' | 'pending' | 'expired', tier }` for the caller's own session, fulfilling it immediately if paid.
- **`POST /api/stripe/webhook`**: Stripe webhooks (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`). Signature required in production.
- **`POST /api/iap/apple/verify`** (iOS): Body `{ signedTransaction }` (StoreKit 2 JWS). Verifies and stores the subscription, returns `{ tier }`. `403 OWNED_BY_OTHER_ACCOUNT` if it belongs to another account.
- **`POST /api/iap/google/verify`** (Android): Body `{ purchaseToken }`. Verifies with the Play Developer API, acknowledges, returns `{ tier }`. `403 OWNED_BY_OTHER_ACCOUNT` as above.
- **`POST /api/iap/apple/notifications`**: App Store Server Notifications V2 receiver.
- **`POST /api/iap/google/rtdn`**: Google Play Real-Time Developer Notifications (Pub/Sub push, OIDC-authenticated).
- **`GET /api/referrals`**: Returns the authenticated user's referral code, total friends referred, and active bonus days.

---

## 10. Web Admin Portal Endpoints
Protected by the `x-admin-secret` header (checked against `process.env.ADMIN_SECRET`, defaulting to `admin123` in local development). Powers the Next.js Web Admin Portal at `/admin`.

### 10.1 Exam Catalog (`/api/admin/exams`)
- **`GET /api/admin/exams`**: Lists all exams (`exam_topics`) ordered by `createdAt` DESC with `sessionCount`.
- **`POST /api/admin/exams`**: Creates a new exam with `titleNo`, `level` (`'B1' | 'B2'`), `monologuePromptNo` (Del 1), `discussionPromptNo` (Del 2), `followUpQuestionsNo` (Del 3 question pool array), and `isActive`.
- **`PATCH /api/admin/exams/[id]`**: Updates exam prompts, question pool, level, title, or `isActive` status.
- **`DELETE /api/admin/exams/[id]`**: Unlinks historical sessions and deletes the exam topic row.
- `POST`/`PATCH` accept an optional `themeId` (UUID or `null`) to assign a question set to a theme; `GET` includes `themeId` and `themeTitleNo`.

### 10.1b Themes (`/api/admin/themes`)
- **`GET /api/admin/themes`**: Lists all themes ordered by `sortOrder`, `titleNo`, with `setCounts` per level.
- **`POST /api/admin/themes`**: Creates a theme with `titleNo`, optional `slug`, `descriptionNo`, `sortOrder`, `isActive`.
- **`PATCH /api/admin/themes/[id]`**: Updates title, slug, description, sort order or `isActive`.
- **`DELETE /api/admin/themes/[id]`**: Deletes the theme; its question sets and sessions keep existing with `theme_id = NULL`.

### 10.2 Configuration Management (`/api/admin/config`)
- **`GET /api/admin/config`**: Returns current tier policies (`tiers`) and referral parameters (`referral: { bonusDailyTests, durationDays }`).
- **`PUT /api/admin/config`**: Updates a tier limit, monthly price, and feature array (`tier`, `dailyTestLimit`, `priceCents`, `currency`, `features: string[]`), or updates referral bonus parameters (`bonusDailyTests`, `durationDays`). Saves directly to `tier_configs` and `system_configs`.


