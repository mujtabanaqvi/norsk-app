/**
 * Persona prompts and line generation for the examiner (sensor) and AI co-candidate.
 * Fixed exam phrases use templates (fast, reliable); conversational lines use gpt-4.1-mini.
 */
import { generateText } from 'ai';
import { getConversationModel, getConversationModelName } from './ai-provider';
import type { SpeakerAction } from './exam-engine';
import type { TranscriptEntry } from '../db/schema';

export const CONVERSATION_MODEL = getConversationModelName();

export interface PersonaContext {
  level: 'B1' | 'B2';
  mode: 'AI_PEER' | 'HUMAN_LOCAL';
  topic: {
    titleNo: string;
    monologuePromptNo: string;
    discussionPromptNo: string;
    followUpQuestionsNo: string[];
  };
  transcript: TranscriptEntry[];
}

export interface GeneratedLine {
  text: string;
  promptTokens: number;
  completionTokens: number;
}

/** Deterministic template lines (no LLM call). Returns null when the intent needs the LLM. */
export function templateLine(action: SpeakerAction, ctx: PersonaContext): string | null {
  const { topic, level, mode } = ctx;
  switch (action.intent) {
    case 'GREET_AND_TASK':
      return `Hei, og velkommen til muntlig prøve i norsk på nivå ${level}. Jeg er sensoren din i dag. Vi begynner med del én, der du snakker alene i et par minutter. Temaet er: ${topic.titleNo}. ${topic.monologuePromptNo} Trykk på mikrofonen og begynn når du er klar.`;
    case 'INTRO_DEL2':
      return mode === 'AI_PEER'
        ? `Takk skal du ha. Da går vi videre til del to, samtaleoppgaven. Nå skal du diskutere med en medkandidat. Oppgaven er: ${topic.discussionPromptNo}`
        : `Takk skal du ha. Da går vi videre til del to, samtaleoppgaven. Nå skal dere to diskutere sammen, og jeg lytter uten å avbryte. Oppgaven er: ${topic.discussionPromptNo} Velg hvem som snakker før hvert innlegg, og trykk «Fullfør diskusjon» når dere er ferdige.`;
    case 'CLOSE':
      return 'Tusen takk. Det var det siste spørsmålet, og prøven er nå ferdig. Du får vurderingen din om et øyeblikk. Ha en fin dag!';
    default:
      return null;
  }
}

function transcriptWindow(transcript: TranscriptEntry[], max = 14): string {
  const label: Record<TranscriptEntry['role'], string> = {
    EXAMINER: 'Sensor',
    AI_COCANDIDATE: 'Medkandidat',
    CANDIDATE_1: 'Kandidat',
    CANDIDATE_2: 'Kandidat 2',
  };
  return transcript
    .slice(-max)
    .map((t) => `${label[t.role] ?? t.role}: ${t.text}`)
    .join('\n');
}

function levelStyle(level: 'B1' | 'B2'): string {
  return level === 'B1'
    ? 'Bruk enkelt, tydelig og naturlig norsk (B1-nivå): korte setninger og vanlige ord.'
    : 'Bruk naturlig, variert norsk (B2-nivå), men hold setningene tydelige.';
}

export function buildPrompt(
  action: SpeakerAction,
  ctx: PersonaContext
): { system: string; prompt: string } {
  const { topic, level } = ctx;
  const history = transcriptWindow(ctx.transcript);

  if (action.persona === 'co_candidate') {
    const system = `Du er en medkandidat som tar Norskprøven muntlig på nivå ${level} sammen med brukeren.
Samtaleoppgave: "${topic.discussionPromptNo}"
${levelStyle(level)}
Regler:
- Svar med 2–3 korte, muntlige setninger (maks ca. 45 ord). Ingen lister, ingen emojier, ingen rollebetegnelser.
- Del egne meninger og enkle erfaringer, vær gjerne litt uenig, og still ofte et oppfølgingsspørsmål til brukeren.
- Ikke rett brukerens språkfeil og ikke opptre som lærer eller sensor.`;
    const task =
      action.intent === 'PEER_OPEN'
        ? 'Start samtalen: hils kort, si din første mening om oppgaven og spør hva brukeren mener.'
        : action.intent === 'PEER_WRAP_UP'
          ? 'Avrund samtalen høflig: oppsummer kort hva dere har snakket om og si at du synes det var en fin samtale. Ikke still flere spørsmål.'
          : 'Svar på det brukeren nettopp sa, og hold samtalen i gang.';
    return { system, prompt: `Samtalen så langt:\n${history}\n\nOppgave: ${task}` };
  }

  // Examiner
  const system = `Du er en offisiell sensor for Norskprøven muntlig på nivå ${level} (HK-dir).
Tema: "${topic.titleNo}". ${levelStyle(level)}
Regler:
- Vær vennlig, profesjonell og kort (maks ca. 40 ord). Ingen lister, ingen emojier, ingen rollebetegnelser.
- Ikke gi tilbakemelding på språket eller vurder kandidaten underveis.`;

  let task: string;
  if (action.intent === 'NUDGE') {
    task = `Kandidatens monolog var kort. Be vennlig kandidaten om å utdype, f.eks. ved å gi et eksempel, fortelle om egne erfaringer eller begrunne meningen sin. Monologoppgaven er: "${topic.monologuePromptNo}"`;
  } else {
    const q = topic.followUpQuestionsNo[action.followUpIndex ?? 0] ?? '';
    task = action.transitionToDel3
      ? `Takk for samtalen og si at dere nå går over til del tre med noen oppfølgingsspørsmål. Still deretter dette spørsmålet (du kan omformulere litt): "${q}"`
      : `Gi en svært kort, nøytral kvittering (f.eks. "Takk." eller "Ja, interessant.") og still deretter dette spørsmålet (du kan omformulere litt): "${q}"`;
  }
  return { system, prompt: `Samtalen så langt:\n${history}\n\nOppgave: ${task}` };
}

function fallbackLine(action: SpeakerAction, ctx: PersonaContext): string {
  switch (action.intent) {
    case 'NUDGE':
      return 'Takk. Kan du si litt mer om dette? Gi gjerne et eksempel fra ditt eget liv.';
    case 'PEER_OPEN':
      return 'Hei! Jeg synes dette er et interessant tema. Hva mener du om det?';
    case 'PEER_WRAP_UP':
      return 'Takk, det var en fin samtale. Jeg synes vi har fått fram mange gode poenger.';
    case 'PEER_REPLY':
      return 'Det er et godt poeng. Kan du forklare litt mer hvorfor du mener det?';
    case 'ASK_FOLLOWUP': {
      const q = ctx.topic.followUpQuestionsNo[action.followUpIndex ?? 0] ?? '';
      return action.transitionToDel3
        ? `Takk for samtalen. Vi går nå over til del tre. ${q}`
        : `Takk. ${q}`;
    }
    default:
      return 'Takk.';
  }
}

export async function generateLine(
  action: SpeakerAction,
  ctx: PersonaContext
): Promise<GeneratedLine> {
  const template = templateLine(action, ctx);
  if (template) return { text: template, promptTokens: 0, completionTokens: 0 };

  const { system, prompt } = buildPrompt(action, ctx);
  try {
    const result = await generateText({
      model: getConversationModel(),
      system,
      prompt,
      temperature: 0.7,
      maxOutputTokens: 160,
    });
    const usage = result.usage as { inputTokens?: number; outputTokens?: number } | undefined;
    const text = result.text.trim().replace(/^(Sensor|Medkandidat)\s*:\s*/i, '');
    return {
      text: text || fallbackLine(action, ctx),
      promptTokens: usage?.inputTokens ?? 0,
      completionTokens: usage?.outputTokens ?? 0,
    };
  } catch (err) {
    console.error('[Personas] LLM generation failed, using fallback line:', err);
    return { text: fallbackLine(action, ctx), promptTokens: 0, completionTokens: 0 };
  }
}

