/**
 * Deterministic Norskprøven muntlig exam state machine.
 *
 * Code (not the LLM) decides when the exam moves between parts, which makes the
 * flow predictable: Del 1 (monolog) → Del 2 (samtale) → Del 3 (oppfølging) → avslutning.
 * The LLM is only used to phrase each line (see personas.ts).
 *
 * This module is pure (no I/O) so it can be unit tested exhaustively.
 */

export type Stage =
  | 'DEL1_MONOLOGUE'
  | 'DEL2_AI'
  | 'DEL2_HUMAN'
  | 'DEL3'
  | 'DONE';

/** Coarse stage shown in the mobile UI phase pills. */
export type UiStage = 'DEL_1' | 'DEL_2' | 'DEL_3' | 'DONE';

export type Persona = 'examiner' | 'co_candidate';

export type Intent =
  | 'GREET_AND_TASK' // examiner greets and gives the Del 1 monologue task
  | 'NUDGE' // examiner asks the candidate to elaborate on a too-short monologue
  | 'INTRO_DEL2' // examiner introduces Del 2 (discussion)
  | 'PEER_OPEN' // AI co-candidate opens the discussion
  | 'PEER_REPLY' // AI co-candidate responds during discussion
  | 'PEER_WRAP_UP' // AI co-candidate politely rounds off the discussion
  | 'ASK_FOLLOWUP' // examiner asks follow-up question #followUpIndex
  | 'CLOSE'; // examiner thanks the candidate and ends the exam

export interface SpeakerAction {
  persona: Persona;
  intent: Intent;
  /** For ASK_FOLLOWUP: the question index into topic.followUpQuestionsNo */
  followUpIndex?: number;
  /** When true, the examiner should transition into Del 3 before asking. */
  transitionToDel3?: boolean;
}

export interface EngineState {
  stage: Stage;
  del1Nudges: number;
  del2Exchanges: number;
  del2StartedAt?: number;
  followUpIndex: number;
}

export interface EngineConfig {
  /** Minimum words before a Del 1 monologue is accepted without a nudge. */
  minMonologueWords: number;
  maxDel1Nudges: number;
  /** Number of candidate turns in AI_PEER discussion before the peer wraps up. */
  aiPeerExchanges: number;
  /** HUMAN_LOCAL discussion time limit in ms. */
  humanDiscussionMaxMs: number;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  minMonologueWords: 40,
  maxDel1Nudges: 1,
  aiPeerExchanges: 5,
  humanDiscussionMaxMs: 4 * 60_000,
};

export type Mode = 'AI_PEER' | 'HUMAN_LOCAL';

export interface TurnInput {
  mode: Mode;
  wordCount: number;
  /** HUMAN_LOCAL: user tapped "Fullfør diskusjon". Ignored outside Del 2. */
  endDiscussion?: boolean;
  now: number;
}

export interface AdvanceResult {
  state: EngineState;
  speakers: SpeakerAction[];
}

export function initialState(): EngineState {
  return { stage: 'DEL1_MONOLOGUE', del1Nudges: 0, del2Exchanges: 0, followUpIndex: 0 };
}

/** The examiner's opening line for a fresh session. */
export function openingActions(): SpeakerAction[] {
  return [{ persona: 'examiner', intent: 'GREET_AND_TASK' }];
}

export function toUiStage(stage: Stage): UiStage {
  switch (stage) {
    case 'DEL1_MONOLOGUE':
      return 'DEL_1';
    case 'DEL2_AI':
    case 'DEL2_HUMAN':
      return 'DEL_2';
    case 'DEL3':
      return 'DEL_3';
    default:
      return 'DONE';
  }
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function enterDel3(state: EngineState, followUpCount: number): AdvanceResult {
  if (followUpCount === 0) {
    return {
      state: { ...state, stage: 'DONE' },
      speakers: [{ persona: 'examiner', intent: 'CLOSE' }],
    };
  }
  return {
    state: { ...state, stage: 'DEL3', followUpIndex: 0 },
    speakers: [
      { persona: 'examiner', intent: 'ASK_FOLLOWUP', followUpIndex: 0, transitionToDel3: true },
    ],
  };
}

/**
 * Advance the exam after the candidate (or a HUMAN_LOCAL "end discussion" signal) has spoken.
 */
export function advance(
  state: EngineState,
  input: TurnInput,
  followUpCount: number,
  config: EngineConfig = DEFAULT_ENGINE_CONFIG
): AdvanceResult {
  switch (state.stage) {
    case 'DEL1_MONOLOGUE': {
      if (input.wordCount < config.minMonologueWords && state.del1Nudges < config.maxDel1Nudges) {
        return {
          state: { ...state, del1Nudges: state.del1Nudges + 1 },
          speakers: [{ persona: 'examiner', intent: 'NUDGE' }],
        };
      }
      if (input.mode === 'AI_PEER') {
        return {
          state: { ...state, stage: 'DEL2_AI', del2Exchanges: 0, del2StartedAt: input.now },
          speakers: [
            { persona: 'examiner', intent: 'INTRO_DEL2' },
            { persona: 'co_candidate', intent: 'PEER_OPEN' },
          ],
        };
      }
      return {
        state: { ...state, stage: 'DEL2_HUMAN', del2Exchanges: 0, del2StartedAt: input.now },
        speakers: [{ persona: 'examiner', intent: 'INTRO_DEL2' }],
      };
    }

    case 'DEL2_AI': {
      const exchanges = state.del2Exchanges + 1;
      if (exchanges >= config.aiPeerExchanges) {
        const del3 = enterDel3({ ...state, del2Exchanges: exchanges }, followUpCount);
        return {
          state: del3.state,
          speakers: [{ persona: 'co_candidate', intent: 'PEER_WRAP_UP' }, ...del3.speakers],
        };
      }
      return {
        state: { ...state, del2Exchanges: exchanges },
        speakers: [{ persona: 'co_candidate', intent: 'PEER_REPLY' }],
      };
    }

    case 'DEL2_HUMAN': {
      const exchanges = state.del2Exchanges + (input.wordCount > 0 ? 1 : 0);
      const elapsed = input.now - (state.del2StartedAt ?? input.now);
      if (input.endDiscussion || elapsed >= config.humanDiscussionMaxMs) {
        return enterDel3({ ...state, del2Exchanges: exchanges }, followUpCount);
      }
      // Passive moderator: the examiner stays silent while the two candidates talk.
      return { state: { ...state, del2Exchanges: exchanges }, speakers: [] };
    }

    case 'DEL3': {
      const next = state.followUpIndex + 1;
      if (next >= followUpCount) {
        return {
          state: { ...state, stage: 'DONE', followUpIndex: next },
          speakers: [{ persona: 'examiner', intent: 'CLOSE' }],
        };
      }
      return {
        state: { ...state, followUpIndex: next },
        speakers: [{ persona: 'examiner', intent: 'ASK_FOLLOWUP', followUpIndex: next }],
      };
    }

    case 'DONE':
    default:
      return { state, speakers: [] };
  }
}

