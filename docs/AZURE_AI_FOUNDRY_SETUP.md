# Azure AI Foundry Setup & Configuration Guide

This guide sets up an **Azure AI Foundry** resource to run every AI workload in the Norwegian Oral Exam Simulator. You only need one resource and one key:

| Workload | Azure service | Selected by |
|---|---|---|
| Conversation LLM (Sensor & AI co-candidate) | Azure OpenAI deployment (e.g. `gpt-5.4-mini`) | `AI_PROVIDER=azure` |
| Rubric evaluation | Azure OpenAI deployment (e.g. `gpt-5`) | `AI_PROVIDER=azure` |
| Text-to-speech (Norwegian neural voices) | Azure AI Speech | `AI_PROVIDER=azure` |
| Speech-to-text (candidate answers) | **Azure AI Speech fast transcription** (recommended) or an Azure OpenAI Whisper deployment | `STT_PROVIDER` |

Azure AI Speech is part of Foundry Tools. A Foundry (AI Services) resource includes it automatically, so you don't need a separate Speech resource, key or region.

---

## 1. Prerequisites
- An active **Microsoft Azure subscription**.
- `Contributor` or `Cognitive Services OpenAI Contributor` on the target resource group.

---

## 2. Step 1: Create an Azure AI Foundry Resource / Project

1. Open the **[Azure AI Foundry portal](https://ai.azure.com/)** and sign in.
2. Click **+ New project** and create (or select) a Foundry resource:
   - **Resource group**: e.g. `rg-norsk-app`
   - **Region**: **Sweden Central** is recommended. It offers low latency to Norway, EU data residency, and support for both the GPT models and Norwegian Speech (`nb-NO`).
3. Click **Create**. The resource is created on the Standard (S0) tier, which fast transcription requires.

---

## 3. Step 2: Deploy Models

In your project, open **Models + endpoints** and deploy the models below. The app refers to them by deployment name, so you can name them anything and map the names in `.env.local`.

### Deployment 1: Conversation model
Drives the examiner and co-candidate dialogue in Del 1–3. It needs low latency.
- **Model**: `gpt-5.4-mini` (or `gpt-4.1-mini` / `gpt-5-mini`)
- **Deployment type**: `Global Standard`
- **Env var**: `AZURE_OPENAI_CHAT_DEPLOYMENT`
- **Capacity**: each exam turn uses a few thousand tokens. Give it enough TPM for your peak number of concurrent users. You can raise it later on the deployment's **Edit** page.

### Deployment 2: Evaluation model
Grades the transcript against the HK-dir criteria and returns structured JSON.
- **Model**: `gpt-5` (or `gpt-4.1`)
- **Deployment type**: `Global Standard`
- **Env var**: `AZURE_OPENAI_EVAL_DEPLOYMENT`

### Speech-to-text: no deployment needed (Azure AI Speech)
Fast transcription is built into the Foundry resource. Nothing needs to be deployed. Set `STT_PROVIDER=azure-speech` (see Step 4).

| | Azure AI Speech fast transcription | Azure OpenAI Whisper deployment |
|---|---|---|
| `STT_PROVIDER` | `azure-speech` | `azure-openai` |
| Default rate limit | **600 requests/min** per resource (adjustable) | **3 requests/min** |
| `nb-NO` | ✅ | ✅ |
| Transcription style | Literal, which suits exam scoring. Numbers come back as digits ("tre" → "3"). | May silently "correct" learner grammar |
| Setup | None | Deploy `whisper` and set `AZURE_OPENAI_WHISPER_DEPLOYMENT` |

> Whisper on Azure OpenAI is fine for development, but at 3 requests/min it can't serve more than a couple of simultaneous users. Use Azure AI Speech in production.

### Optional: Whisper deployment (`STT_PROVIDER=azure-openai`)
1. **+ Deploy model** → `whisper` → deployment type `Standard`.
2. Set `AZURE_OPENAI_WHISPER_DEPLOYMENT` to the deployment name.

---

## 4. Step 3: Retrieve Keys and Endpoint

In the Foundry portal (or the Azure Portal → your resource → **Keys and Endpoint**), copy:
- **Key**: `Key 1` or `Key 2` → `AZURE_OPENAI_API_KEY`
- **Resource name**: the `<name>` in `https://<name>.openai.azure.com/` → `AZURE_OPENAI_RESOURCE_NAME`

---

## 5. Step 4: Configure `.env.local`

Minimal all-Azure configuration:

```env
AI_PROVIDER=azure
STT_PROVIDER=azure-speech

AZURE_OPENAI_RESOURCE_NAME=your-foundry-resource
AZURE_OPENAI_API_KEY=your-foundry-key
AZURE_OPENAI_CHAT_DEPLOYMENT=gpt-5.4-mini
AZURE_OPENAI_EVAL_DEPLOYMENT=gpt-5
AZURE_OPENAI_API_VERSION=2024-10-21

# Optional: use instead of / in addition to AZURE_OPENAI_RESOURCE_NAME
# AZURE_OPENAI_ENDPOINT=https://your-foundry-resource.openai.azure.com/
```

You don't need `AZURE_SPEECH_KEY` or `AZURE_SPEECH_REGION`. Speech uses the Foundry key and the resource's own endpoint.

### How the Azure Speech endpoint is resolved
TTS and STT use the same rules, in this order:

1. **`AZURE_SPEECH_REGION` is set** → regional endpoints:
   `https://<region>.tts.speech.microsoft.com/cognitiveservices/v1` and `https://<region>.api.cognitive.microsoft.com/speechtotext/...`
2. **No `AZURE_SPEECH_KEY`** (so the Foundry key is used) → the Foundry resource endpoint:
   `https://<resource>.cognitiveservices.azure.com/tts/cognitiveservices/v1` and `https://<resource>.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe`.
   The resource name comes from `AZURE_OPENAI_RESOURCE_NAME`, or else from the host of `AZURE_OPENAI_ENDPOINT` (`*.openai.azure.com`, `*.cognitiveservices.azure.com` or `*.services.ai.azure.com`).
3. **Otherwise** → regional endpoints in `swedencentral`.

### Optional Speech overrides
| Variable | Purpose | Default |
|---|---|---|
| `AZURE_SPEECH_KEY` | Key of a separate Speech resource | `AZURE_OPENAI_API_KEY` |
| `AZURE_SPEECH_REGION` | Force regional endpoints (e.g. a separate Speech resource) | resolved as above |
| `AZURE_SPEECH_ENDPOINT` | Full TTS URL override | resolved as above |
| `AZURE_SPEECH_STT_ENDPOINT` | STT base URL override | resolved as above |
| `AZURE_SPEECH_STT_LOCALE` | Transcription locale | `nb-NO` |
| `AZURE_SPEECH_STT_API_VERSION` | Fast transcription API version | `2025-10-15` |
| `AZURE_SPEECH_EXAMINER_VOICE` / `AZURE_SPEECH_COCANDIDATE_VOICE` | Neural voices | `nb-NO-PernilleNeural` / `nb-NO-FinnNeural` |

### Switching providers
Each switch is independent:

| Setting | Values | Effect |
|---|---|---|
| `AI_PROVIDER` | `azure` \| `openai` | LLMs. Also TTS (`azure` → Azure AI Speech, `openai` → ElevenLabs with OpenAI TTS fallback) |
| `STT_PROVIDER` | `azure-speech` \| `azure-openai` \| `openai` | Speech-to-text. If unset, follows `AI_PROVIDER` (`azure` → `azure-openai`, `openai` → `openai`) |

---

## 6. Capacity & Scaling

Rough load for **100 concurrent users** (one candidate answer every 30–60 s):

| Stage | Load | Default limit | Status |
|---|---|---|---|
| STT (Azure AI Speech) | ~100–200 requests/min | 600 requests/min | ✅ |
| TTS (Azure AI Speech) | ~2–6 requests/s | 30 requests/s (adjustable to 1,000) | ✅ |
| Conversation LLM | ~100–200 requests/min | Deployment TPM/RPM | Check the deployment's TPM |
| Evaluation LLM | Bursts when exams finish | Deployment TPM | Check the deployment's TPM |

- All STT providers retry automatically on `429` / `503` with exponential backoff (honouring `Retry-After`, up to 3 attempts). Azure can return 429 briefly while it scales up.
- To go beyond 600 transcriptions/min, request an increase through the [Foundry Tools quota form](https://aka.ms/foundry-tools-quota-increase) ("Maximum requests per minute for fast transcription"; requires a work/organization email). You can also create a second resource in another region and spread load across both (this needs a small code change).

---

## 7. Verification Checklist

```bash
npm test
npm run dev
```
1. Start an exam on web (`/`) or in Expo Go.
2. Record an answer in Del 1. Your transcript should appear and the examiner should reply with audio.
3. The requests go to:
   - STT: `https://<resource>.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15`
   - TTS: `https://<resource>.cognitiveservices.azure.com/tts/cognitiveservices/v1`
   - LLM: `https://<resource>.openai.azure.com/openai/deployments/<deployment>/...` via `@ai-sdk/azure`
4. Test on a real phone as well. iOS and Android record AAC in `.m4a`, while the web records WebM. If you speak clearly but always get "Beklager, jeg hørte ikke…", the phone's audio format is being rejected.
