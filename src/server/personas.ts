/**
 * Persona prompts and line generation for the examiner (sensor) and AI co-candidate.
 * Fixed exam phrases use templates (fast, reliable); conversational lines use gpt-4.1-mini.
 */
import { generateText } from 'ai';
import {
  getConversationModel,
  getConversationModelName,
  getActiveAiProvider,
} from './ai-provider';
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
Regler for naturlig samtale:
- Svar med 2–4 naturlige, muntlige setninger (maks ca. 55 ord). Ingen lister, ingen emojier, ingen rollebetegnelser eller meta-kommentarer.
- FORBUDT: Aldri si tomme bekreftelser eller klisjeer som "Det er et godt poeng", "Det var et godt poeng", "Jeg er enig med deg", eller "Interessant synspunkt".
- Reager direkte på det kandidaten faktisk sa. Vis en ekte holdning eller personlig erfaring, og utfordre eller nyansér argumentet ("Men hvis man tenker på...", "Samtidig opplever mange at...", "På en måte, men hva med...", "Tror du ikke at...").
- Vær en aktiv og engasjert samtalepartner som driver diskusjonen framover med et genuint spørsmål eller et motargument.
- Ikke rett brukerens språkfeil og opptre aldri som lærer eller sensor.`;
    const task =
      action.intent === 'PEER_OPEN'
        ? 'Start diskusjonen naturlig: presenter umiddelbart en klar, personlig mening eller vinkling om oppgaven, begrunn den kort, og spør hva brukeren tenker om dette.'
        : action.intent === 'PEER_WRAP_UP'
          ? 'Avrund diskusjonen høflig og naturlig: nevn kort en felles konklusjon eller motsetning dere diskuterte, og si at det var en god diskusjon. Ikke still nye spørsmål.'
          : 'Hør nøye på kandidatens siste innlegg i samtaleloggen. Kommentér direkte på et konkret poeng eller eksempel de nevnte, si hva du selv mener eller argumentér fra en annen vinkel, og still et oppfølgende spørsmål som utfordrer eller utforsker synspunktet deres videre.';
    return { system, prompt: `Samtalen så langt:\n${history}\n\nOppgave for neste innlegg: ${task}` };
  }

  // Examiner
  const system = `Du er en offisiell sensor for Norskprøven muntlig på nivå ${level} (HK-dir).
Tema for prøven: "${topic.titleNo}". ${levelStyle(level)}
Regler:
- Vær vennlig, profesjonell, lyttende og konsis (maks ca. 45 ord). Ingen lister, ingen emojier, ingen rollebetegnelser.
- Reager som et ekte menneske som har lyttet oppmerksomt: knytt neste spørsmål eller oppfordring direkte til det kandidaten nettopp snakket om (f.eks. "Siden du snakket om...", "Du nevnte at...").
- Aldri bruk mekaniske fraser som bare "Takk." eller "Ja, interessant." alene. Vis med en kort setning eller formulering at du hørte innholdet, før du stiller spørsmålet.
- Ikke gi vurdering, karakter eller tilbakemelding på grammatikk/ordforråd underveis.`;

  let task: string;
  if (action.intent === 'NUDGE') {
    task = `Kandidatens monolog var for kort. Vis kort at du hørte hva kandidaten begynte å snakke om, og be dem vennlig utdype med et konkret eksempel eller en begrunnelse for synspunktet sitt. Monologoppgaven er: "${topic.monologuePromptNo}"`;
  } else {
    const q = topic.followUpQuestionsNo[action.followUpIndex ?? 0] ?? '';
    task = action.transitionToDel3
      ? `Takk kort for diskusjonen og forklar at dere nå går over til del tre med noen oppfølgingsspørsmål. Still deretter dette oppfølgingsspørsmålet, og tilpass gjerne formuleringen litt slik at det flyter naturlig fra det kandidaten har snakket om: "${q}"`
      : `Knytt an til det kandidaten nettopp svarte i samtaleloggen, og still dette oppfølgingsspørsmålet på en naturlig, muntlig måte: "${q}"`;
  }
  return { system, prompt: `Samtalen så langt:\n${history}\n\nOppgave for sensoren: ${task}` };
}

function fallbackLine(action: SpeakerAction, ctx: PersonaContext): string {
  switch (action.intent) {
    case 'NUDGE':
      return 'Takk for det du delte. Kan du utdype litt mer om dette, og kanskje gi et konkret eksempel fra egne erfaringer?';
    case 'PEER_OPEN':
      return 'Jeg har tenkt en del på dette, og jeg mener at dette påvirker hverdagen vår mer enn vi tror. Hva tenker du om saken?';
    case 'PEER_WRAP_UP':
      return 'Takk for en god samtale! Vi fikk belyst flere sider av saken, og det var spennende å høre dine tanker.';
    case 'PEER_REPLY':
      return 'Jeg forstår hvordan du ser det, men opplever du ikke også at det kan få andre konsekvenser i praksis? Hva tenker du om det?';
    case 'ASK_FOLLOWUP': {
      const q = ctx.topic.followUpQuestionsNo[action.followUpIndex ?? 0] ?? '';
      return action.transitionToDel3
        ? `Takk for en fin diskusjon. Nå går vi over til del tre med noen oppfølgingsspørsmål. ${q}`
        : `Det er et relevant perspektiv. ${q}`;
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
    const isAzure = getActiveAiProvider() === 'azure';
    const result = await generateText({
      model: getConversationModel(),
      system,
      prompt,
      temperature: 0.7,
      ...(isAzure
        ? {
            providerOptions: {
              openai: {
                maxCompletionTokens: 160,
              },
            },
          }
        : {
            maxOutputTokens: 160,
          }),
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

