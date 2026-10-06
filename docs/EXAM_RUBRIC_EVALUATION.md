# B1/B2 Rubric Evaluation Engine

The evaluation engine in [`lib/evaluation.ts`](../lib/evaluation.ts) grades candidate oral proficiency according to official **Direktoratet for høyere utdanning og kompetanse (HK-dir)** guidelines and the **Common European Framework of Reference for Languages (CEFR)**.

---

## 1. Assessment Criteria

The rubric evaluates five dimensions of spoken Norwegian:

| Criterion | Norwegian Term | CEFR B1 Indicators | CEFR B2 Indicators |
| :--- | :--- | :--- | :--- |
| **Pronunciation** | *Uttale & Intonasjon* | Forståelig uttale; morsmålsaksent er merkbar, men hemmer sjelden forståelse. | Tydelig, naturlig intonasjon og god rytme. Lite anstrengende for samtalepartneren. |
| **Fluency** | *Flyt & Turtaking* | Kan holde samtalen gående, men med enkelte pauser for å lete etter ord og planlegge ytringer. | God flyt med naturlig tempo; lite nøling og uanstrengt turtaking. |
| **Vocabulary** | *Ordforråd* | Tilstrekkelig ordforråd til å uttrykke seg om kjente emner og hverdagssituasjoner. | Bredt og nyansert ordforråd; behersker faguttrykk, faste uttrykk og synonymer. |
| **Grammar** | *Grammatikk* | Rimelig god kontroll over enkle setninger; feil med V2-regelen eller preposisjoner forekommer. | God beherskelse av leddsetninger, inversjon (V2-regelen), tempus og passivformer; få feil. |
| **Coherence** | *Sammenheng & Oppgaveløsning* | Kan knytte sammen enkle ytringer med bindeord (*fordi*, *men*, *så*); besvarer oppgaven. | Strukturert argumentasjon med varierte tekstbindere (*dessuten*, *på den ene siden*); reflekterer over motargumenter. |

---

## 2. Evaluation Lifecycle & Execution Modes

### Mode A: Direct In-Process Evaluation (`src/lib/evaluate-exam.ts`)
Used by the in-repo LiveKit Voice Agent Worker (`src/agent/worker.ts`) upon room shutdown:
```
[Voice Agent ctx.addShutdownCallback()]
          │
          ▼
[Atomic DB Transaction Commits Usage & Transcript]
          │
          ▼
[evaluateExamSession(sessionId)]
          │
          ▼
[Fetch exam session & candidate utterances from Neon]
          │
          ▼
[Call OpenAI GPT-4o with HK-dir CEFR Rubric & JSON Schema]
          │
          ▼
[Save evaluation_json directly to exam_sessions in Neon]
```
- **Direct Database Access**: Queries and updates `exam_sessions` directly in Neon using Drizzle ORM without HTTP handshakes.
- **Model**: OpenAI `gpt-4o` (temperature `0.2`, structured JSON output).

### Mode B: Asynchronous Webhook Evaluation (`lib/evaluation.ts`)
Used by the external HTTP webhook endpoint (`/api/webhooks/agent-complete`):
- **Non-blocking Execution**: The rubric evaluation is invoked as a background promise without awaiting completion before responding to the agent worker webhook with `HTTP 200`.
- **Resilience / Fallback**: If `OPENAI_API_KEY` is not present, the evaluator falls back to a deterministic rule-based evaluation that calculates utterance counts, vocabulary volume, and standard feedback, preventing timeouts or uncaught rejections.

---

## 3. Evaluation Schema Example

Stored in `exam_sessions.evaluation_json`:

```json
{
  "overallLevel": "B2",
  "passedTargetLevel": true,
  "summary": "Kandidaten viser god evne til å drøfte temaet nyansert og begrunne egne standpunkter. Ordforrådet er variert og setningsbygningen er for det meste presis.",
  "criteria": {
    "uttale": {
      "score": 4,
      "levelAchieved": "B2",
      "feedback": "Klar artikulasjon og god norsk intonasjon.",
      "evidence": ["Det er en stor fordel for miljøet..."]
    },
    "flyt": {
      "score": 4,
      "levelAchieved": "B2",
      "feedback": "Spontan tale uten lange pauser.",
      "evidence": []
    },
    "ordforrad": {
      "score": 4,
      "levelAchieved": "B2",
      "feedback": "Presist ordvalg med gode samfunnsfaglige begreper.",
      "evidence": ["subsidiering", "samfunnsøkonomisk"]
    },
    "grammatikk": {
      "score": 3,
      "levelAchieved": "B1",
      "feedback": "Enkelte feil med V2-regelen etter innledende adverbial.",
      "evidence": ["I går jeg dro... (bør være: I går dro jeg...)"]
    },
    "sammenheng": {
      "score": 5,
      "levelAchieved": "B2",
      "feedback": "Svært god oppgaveløsning og naturlig samhandling.",
      "evidence": []
    }
  },
  "keyCorrections": [
    {
      "candidateSaid": "I går jeg så på nyhetene",
      "correction": "I går så jeg på nyhetene",
      "explanation": "V2-regelen: Verbet må stå på andreplass etter foranstilt tidsadverbial."
    }
  ],
  "evaluatedAt": "2026-10-06T08:30:00.000Z"
}
```

