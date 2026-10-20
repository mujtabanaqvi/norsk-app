# Azure AI Foundry Setup & Configuration Guide

This guide walks you through setting up an **Azure AI Foundry** project (formerly Azure AI Studio) to power all AI workloads for the Norwegian Oral Exam Simulator:
- **Conversation LLM** (Sensor & AI Co-candidate dialogue)
- **Rubric Evaluator** (Post-exam structured evaluation)
- **Speech-to-Text (STT)** (Whisper audio transcription)
- *(Optional)* **Azure AI Speech** (Norwegian neural TTS voices)

---

## 1. Prerequisites
- An active **Microsoft Azure subscription** (free trial, pay-as-you-go, or enterprise/startup credits).
- Appropriate permissions (`Contributor` or `Cognitive Services OpenAI Contributor`) on your target Azure Resource Group.

---

## 2. Step 1: Create an Azure AI Foundry Project

1. Navigate to the **[Azure AI Foundry Portal](https://ai.azure.com/)** and sign in with your Azure account.
2. In the top navigation, click **+ New project**.
3. Configure project details:
   - **Project name**: e.g., `norsk-app-foundry`
   - **Hub**: Select an existing Hub or click **Create a new hub** (e.g., `norsk-app-hub`).
   - **Subscription**: Select your Azure subscription.
   - **Resource group**: Select or create a new resource group (e.g., `rg-norsk-app`).
   - **Location / Region**: Choose a region supporting modern OpenAI models and Whisper (e.g., **Sweden Central**, **North Europe**, or **East US 2**). *Tip: Sweden Central and North Europe offer low latency to Norway/Nordics and comply with European data residency requirements.*
4. Click **Create**. Azure will provision the underlying Azure OpenAI and AI Services resources.

---

## 3. Step 2: Deploy Required AI Models in Azure AI Foundry

Once inside your project, go to the left sidebar and select **Deployments** (or **Models + endpoints**):

> [!IMPORTANT]
> **Model Lifecycle & Deprecation Note**: `gpt-4o-mini` is deprecated and `gpt-4o` is nearing retirement. Deploy the newer **GPT-4.1 family** (e.g., `gpt-4.1-mini` and `gpt-4.1`) or `gpt-5-mini` / `gpt-5` in Azure AI Foundry. Because our application uses deployment names, you can name your deployments whatever you prefer and simply map the names in `.env.local`.

### Deployment 1: Chat / Conversational Model (`gpt-4.1-mini`)
This model drives real-time examiner questions and co-candidate dialogue in Del 1, 2, and 3. It provides low latency, conversational fluency in Norwegian, and cost efficiency.
1. Click **+ Deploy model** -> **Deploy base model**.
2. Search for and select **`gpt-4.1-mini`** (or `gpt-5-mini` if available in your region).
3. Click **Confirm**.
4. Configure deployment:
   - **Deployment name**: `gpt-4.1-mini` *(or customize and match `AZURE_OPENAI_CHAT_DEPLOYMENT` in `.env.local`)*
   - **Deployment type**: `Global Standard` or `Standard`
   - **Model version**: Latest available (default)
   - **Tokens Per Minute (TPM) limit**: Start with `30k` - `50k` TPM.
5. Click **Deploy**.

### Deployment 2: Rubric Evaluation Model (`gpt-4.1` or `gpt-5`)
This model evaluates candidate transcripts against official HK-dir criteria with structured JSON output. It requires strong grammatical reasoning and exact JSON schema adherence.
1. Click **+ Deploy model** -> **Deploy base model**.
2. Search for and select **`gpt-4.1`** (or `gpt-5`).
3. Click **Confirm**.
4. Configure deployment:
   - **Deployment name**: `gpt-4.1` *(or customize and match `AZURE_OPENAI_EVAL_DEPLOYMENT` in `.env.local`)*
   - **Deployment type**: `Global Standard` or `Standard`
   - **Model version**: Latest available
   - **Tokens Per Minute (TPM) limit**: `20k` - `40k` TPM.
5. Click **Deploy**.

### Deployment 3: Audio Transcription Model (`whisper`)
This model transcribes the candidate's spoken Norwegian audio.
1. Click **+ Deploy model** -> **Deploy base model**.
2. Search for and select **`whisper`**.
3. Click **Confirm**.
4. Configure deployment:
   - **Deployment name**: `whisper` *(or match `AZURE_OPENAI_WHISPER_DEPLOYMENT` in `.env.local`)*
   - **Deployment type**: `Standard`
   - **Model version**: `001` (default)
5. Click **Deploy**.

> ⚠️ **Scaling limit:** Azure OpenAI audio transcription has a default quota of **3 requests per minute**. That is enough for development but not for production. For more than a handful of concurrent users, use Azure AI Speech (below).

### Recommended for production: Azure AI Speech fast transcription (`STT_PROVIDER=azure-speech`)
Azure AI Speech is part of Foundry Tools, so a Foundry / AI Services resource already includes it. This is the same service the app uses for Norwegian TTS.

| | Azure OpenAI Whisper | Azure AI Speech fast transcription |
|---|---|---|
| Default rate limit | 3 RPM | 600 RPM per resource (S0), adjustable |
| `nb-NO` | ✅ | ✅ |
| Transcription style | May silently "correct" grammar | More literal, which suits exam scoring |

1. Make sure your Foundry resource (or a separate **Speech** resource) is on the **S0** tier. F0 doesn't support fast transcription.
2. Copy its key and region (or its `https://<name>.cognitiveservices.azure.com` endpoint).
3. In `.env.local`:
   ```env
   STT_PROVIDER=azure-speech
   AZURE_SPEECH_KEY=...            # falls back to AZURE_OPENAI_API_KEY
   AZURE_SPEECH_REGION=swedencentral
   # AZURE_SPEECH_STT_ENDPOINT=https://<name>.cognitiveservices.azure.com
   ```
4. You can switch back at any time with `STT_PROVIDER=azure-openai` (Whisper) or `STT_PROVIDER=openai`. If you leave `STT_PROVIDER` unset, the app keeps the old behaviour and follows `AI_PROVIDER`.

**Capacity:** 100 concurrent users produce roughly 100–200 transcriptions/min, which fits the 600 RPM default. For more headroom, request an increase through the [Foundry Tools quota form](https://aka.ms/foundry-tools-quota-increase) ("Maximum requests per minute for fast transcription"), or add a Speech resource in a second region. 429 and 503 responses are retried automatically with backoff.

---

## 4. Step 3: Retrieve Azure Keys and Endpoint

1. In Azure AI Foundry, click **Overview** in the left menu (or open the linked Azure OpenAI service in the [Azure Portal](https://portal.azure.com)).
2. Look for **Project details** or **Resource keys**:
   - **Target URI / Endpoint**: Usually looks like `https://<your-resource-name>.openai.azure.com/`
   - **Key**: Copy `Key 1` or `Key 2`.
   - **Resource Name**: The `<your-resource-name>` prefix of the endpoint URL.

---

## 5. Step 4: Configure `.env.local` in the Application

In your project root, open `.env.local` and configure the following variables:

```env
# Switch AI provider to Azure
AI_PROVIDER=azure

# Azure AI Foundry / Azure OpenAI Credentials
AZURE_OPENAI_RESOURCE_NAME=your-azure-resource-name
AZURE_OPENAI_API_KEY=your-azure-api-key

# Deployment Names (must match what you named them in Step 2)
AZURE_OPENAI_CHAT_DEPLOYMENT=gpt-4.1-mini
AZURE_OPENAI_EVAL_DEPLOYMENT=gpt-4.1
AZURE_OPENAI_WHISPER_DEPLOYMENT=whisper

# API Version (supported stable version)
AZURE_OPENAI_API_VERSION=2024-10-21

# Optional: Custom endpoint (if not using standard https://<resource>.openai.azure.com/)
# AZURE_OPENAI_ENDPOINT=https://your-custom-hub.openai.azure.com/
```

To switch back to direct OpenAI at any time, simply change:
```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

---

## 6. Verification Checklist

Run the automated test suite to verify configuration loading:
```bash
npm test
```

Start the application with Azure active:
```bash
npm run dev
```
1. Start an exam on the mobile client or web (`/`).
2. Record an audio answer in Del 1.
3. Check the backend terminal logs:
   - STT sends audio to: `https://<resource>.openai.azure.com/openai/deployments/whisper/audio/transcriptions` (Whisper), or to `https://<region>.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe` when `STT_PROVIDER=azure-speech`
   - Turn generation invokes Azure chat deployment via `@ai-sdk/azure`.
   - Post-exam evaluation invokes Azure `gpt-4o` with JSON schema enforcement.

