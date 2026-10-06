# HK-dir B1/B2 Rubric Evaluation Engine

The evaluation engine in [`src/lib/evaluate-exam.ts`](../src/lib/evaluate-exam.ts) grades candidate oral exam performance according to the official **Direktoratet for høyere utdanning og kompetanse (HK-dir)** assessment matrix and the **Common European Framework of Reference for Languages (CEFR)**.

---

## 1. Assessment Criteria (1–10 Scale)

The evaluator assesses four primary dimensions of spoken Norwegian on a 1–10 scale:

| Criterion | Key in Schema | Description & HK-dir Indicators |
| :--- | :--- | :--- |
| **Formidling og flyt** | `formidlingOgFlyt` | Spontan tale, talehastighet, pauselokasjon (planlegging vs leting etter ord), turtaking og evne til å holde samtalen i gang. |
| **Uttale og forståelighet** | `uttaleOgForstaelighet` | Artikulasjon, setningsmelodi, norsk trykkplassering, intonasjon og grad av anstrengelse for samtalepartneren. |
| **Ordforråd** | `ordforrad` | Variasjon, presisjon, faste uttrykk og samfunnsrelaterte begreper tilpasset temaet versus gjentakelser og overforenkling. |
| **Grammatikk og setningsstruktur** | `grammatikkOgSetningsstruktur` | Kontroll over V2-regelen (inversjon), leddsetningsstruktur (*ikke* etter subjekt), bøyning av substantiv/adjektiv (kjønn/tall) og verbtempus. |

---

## 2. Score & Level Mapping

Each criterion receives:
- `score`: Integer from 1 to 10.
- `feedbackNo`: Detailed constructive feedback in Norwegian.
- `feedbackEn`: Actionable feedback in English.

The candidate's `assessedLevel` is mapped as:
- **`Under B1`**: Score generally below 5; frequent communication breakdown, fragmented sentences, severe V2 errors.
- **`B1`**: Score 5–7; comprehensible pronunciation, able to participate in everyday debate, minor grammatical errors that do not impede understanding.
- **`B2`**: Score 8–9; clear intonation, nuanced vocabulary, good command of subordinate clauses and complex argumentation.
- **`Over B2`**: Score 10; near-native fluency, idiomatic mastery, spontaneous reasoning without lexical hesitation.

`passedTargetLevel` is `true` if `assessedLevel` meets or exceeds `targetLevel`.

---

## 3. Concrete Corrections Structure

The evaluator selects 5 to 8 specific quotes directly from the candidate's speech:

```typescript
interface ConcreteCorrection {
  originalQuote: string;       // Exact quote from candidate utterance
  correctedNorwegian: string;  // Corrected natural Bokmål phrasing
  grammarOrVocabRule: string;  // Grammatical rule explanation in NO & EN
}
```

*Example:*
```json
{
  "originalQuote": "I går jeg leste om mobilforbud...",
  "correctedNorwegian": "I går leste jeg om mobilforbud...",
  "grammarOrVocabRule": "V2-regelen: Når en setning starter med et tidsadverbial (i går), må det finitte verbet stå på andreplass (inversjon)."
}
```

---

## 4. Single-Candidate vs Dual-Candidate Modes

- **`AI_PEER` Mode**: Evaluates 1 candidate (`speakerRole: 'CANDIDATE_1'`).
- **`HUMAN_LOCAL` Mode**: Evaluates 2 candidates separately (`CANDIDATE_1` and `CANDIDATE_2`), generating distinct criteria scores, summaries, and concrete corrections for both participants.

---

## 5. Execution Lifecycle & Database Ingestion

```
[LiveKit Voice Worker Shutdown]
              │
              ▼
[evaluateExamSession(sessionId)]
              │
              ├── 1. Read transcript & topic from Neon DB
              │
              ├── 2. Check for sufficient candidate speech (>= 10 words)
              │      (If < 10 words, mark insufficientData: true)
              │
              ├── 3. Send transcript to OpenAI GPT-4o (or offline fallback)
              │      (Structured output via Zod ExamEvaluationSchema)
              │
              ├── 4. Update exam_sessions.evaluation_json in Neon
              │
              ├── 5. Insert audit record in usage_ledger (source: 'POST_EXAM_RUBRIC_EVAL')
              │
              └── 6. Increment user_quotas.total_llm_tokens_used and total_cost_usd
```

- **Model**: OpenAI `gpt-4o` with temperature `0.2` and strict JSON schema output.
- **Cost Tracking**: Evaluator tokens are audited in `usage_ledger` with model `gpt-4o` ($2.50 / 1M prompt, $10.00 / 1M completion).
- **Offline / Sandbox Fallback**: If `OPENAI_API_KEY` is not present, the evaluator produces a deterministic rule-based evaluation report based on utterance counts and vocabulary metrics, ensuring seamless test execution.
