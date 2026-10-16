import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState,
  openingActions,
  advance,
  toUiStage,
  countWords,
} from '../src/server/exam-engine';
import { templateLine, buildPrompt } from '../src/server/personas';
import { extensionForMime } from '../src/server/speech';

const SAMPLE_TOPIC = {
  titleNo: 'Miljø og bærekraft i hverdagen',
  monologuePromptNo: 'Fortell om hva du gjør i hverdagen for å ta vare på miljøet.',
  discussionPromptNo: 'Diskuter om det bør bli dyrere å kjøre bil i byene.',
  followUpQuestionsNo: [
    'Hva er det vanskeligste med å leve miljøvennlig?',
    'Tror du unge bryr seg mer om miljøet enn eldre?',
    'Hva kan myndighetene gjøre?',
  ],
};

test('Exam Engine: initializes at DEL1_MONOLOGUE and produces examiner greeting action', () => {
  const state = initialState();
  assert.equal(state.stage, 'DEL1_MONOLOGUE');
  assert.equal(toUiStage(state.stage), 'DEL_1');
  assert.equal(state.del1Nudges, 0);
  assert.equal(state.del2Exchanges, 0);
  assert.equal(state.followUpIndex, 0);

  const actions = openingActions();
  assert.equal(actions.length, 1);
  assert.equal(actions[0].persona, 'examiner');
  assert.equal(actions[0].intent, 'GREET_AND_TASK');
});

test('Exam Engine: short Del 1 monologue triggers at most 1 NUDGE before advancing to Del 2', () => {
  let state = initialState();
  const followUpCount = 3;

  // Turn 1: short utterance (10 words < 40 words) -> NUDGE
  const step1 = advance(
    state,
    { mode: 'AI_PEER', wordCount: 10, now: 1000 },
    followUpCount
  );
  state = step1.state;
  assert.equal(state.stage, 'DEL1_MONOLOGUE');
  assert.equal(state.del1Nudges, 1);
  assert.equal(step1.speakers.length, 1);
  assert.equal(step1.speakers[0].intent, 'NUDGE');

  // Turn 2: still short (12 words), but nudge limit (1) reached -> transitions to DEL2_AI
  const step2 = advance(
    state,
    { mode: 'AI_PEER', wordCount: 12, now: 2000 },
    followUpCount
  );
  state = step2.state;
  assert.equal(state.stage, 'DEL2_AI');
  assert.equal(toUiStage(state.stage), 'DEL_2');
  assert.equal(step2.speakers.length, 2);
  assert.equal(step2.speakers[0].intent, 'INTRO_DEL2');
  assert.equal(step2.speakers[1].intent, 'PEER_OPEN');
});

test('Exam Engine: full AI_PEER flow advances deterministically from Del 1 -> Del 2 (5 turns) -> Del 3 -> DONE', () => {
  let state = initialState();
  const followUpCount = 2;

  // Del 1: full monologue (55 words) -> transitions straight to DEL2_AI
  const del1 = advance(
    state,
    { mode: 'AI_PEER', wordCount: 55, now: 1000 },
    followUpCount
  );
  state = del1.state;
  assert.equal(state.stage, 'DEL2_AI');
  assert.deepEqual(
    del1.speakers.map((s) => s.intent),
    ['INTRO_DEL2', 'PEER_OPEN']
  );

  // Del 2 exchanges 1..4 -> PEER_REPLY
  for (let i = 1; i <= 4; i++) {
    const turn = advance(
      state,
      { mode: 'AI_PEER', wordCount: 25, now: 1000 + i * 5000 },
      followUpCount
    );
    state = turn.state;
    assert.equal(state.stage, 'DEL2_AI');
    assert.equal(state.del2Exchanges, i);
    assert.deepEqual(
      turn.speakers.map((s) => s.intent),
      ['PEER_REPLY']
    );
  }

  // Del 2 exchange 5 -> PEER_WRAP_UP + examiner transitions to DEL3 and asks follow-up #0
  const turn5 = advance(
    state,
    { mode: 'AI_PEER', wordCount: 25, now: 30000 },
    followUpCount
  );
  state = turn5.state;
  assert.equal(state.stage, 'DEL3');
  assert.equal(toUiStage(state.stage), 'DEL_3');
  assert.equal(state.followUpIndex, 0);
  assert.equal(turn5.speakers.length, 2);
  assert.equal(turn5.speakers[0].persona, 'co_candidate');
  assert.equal(turn5.speakers[0].intent, 'PEER_WRAP_UP');
  assert.equal(turn5.speakers[1].persona, 'examiner');
  assert.equal(turn5.speakers[1].intent, 'ASK_FOLLOWUP');
  assert.equal(turn5.speakers[1].followUpIndex, 0);
  assert.equal(turn5.speakers[1].transitionToDel3, true);

  // Answer follow-up #0 -> examiner asks follow-up #1
  const followUp1 = advance(
    state,
    { mode: 'AI_PEER', wordCount: 30, now: 40000 },
    followUpCount
  );
  state = followUp1.state;
  assert.equal(state.stage, 'DEL3');
  assert.equal(state.followUpIndex, 1);
  assert.equal(followUp1.speakers.length, 1);
  assert.equal(followUp1.speakers[0].intent, 'ASK_FOLLOWUP');
  assert.equal(followUp1.speakers[0].followUpIndex, 1);

  // Answer follow-up #1 (last question) -> examiner CLOSE and stage DONE
  const closing = advance(
    state,
    { mode: 'AI_PEER', wordCount: 30, now: 50000 },
    followUpCount
  );
  state = closing.state;
  assert.equal(state.stage, 'DONE');
  assert.equal(toUiStage(state.stage), 'DONE');
  assert.equal(closing.speakers.length, 1);
  assert.equal(closing.speakers[0].intent, 'CLOSE');
});

test('Exam Engine: HUMAN_LOCAL mode stays silent during Del 2 until endDiscussion or timeout', () => {
  let state = initialState();
  const followUpCount = 2;

  // Del 1 -> DEL2_HUMAN
  const del1 = advance(
    state,
    { mode: 'HUMAN_LOCAL', wordCount: 50, now: 1000 },
    followUpCount
  );
  state = del1.state;
  assert.equal(state.stage, 'DEL2_HUMAN');
  assert.equal(del1.speakers.length, 1);
  assert.equal(del1.speakers[0].intent, 'INTRO_DEL2');

  // Candidate 1 & Candidate 2 speak back and forth -> passive moderator (0 AI speakers)
  const cand1Turn = advance(
    state,
    { mode: 'HUMAN_LOCAL', wordCount: 30, now: 10000 },
    followUpCount
  );
  state = cand1Turn.state;
  assert.equal(state.stage, 'DEL2_HUMAN');
  assert.equal(cand1Turn.speakers.length, 0);

  // Explicit endDiscussion signal transitions to DEL3
  const endTurn = advance(
    state,
    { mode: 'HUMAN_LOCAL', wordCount: 0, endDiscussion: true, now: 20000 },
    followUpCount
  );
  state = endTurn.state;
  assert.equal(state.stage, 'DEL3');
  assert.equal(endTurn.speakers.length, 1);
  assert.equal(endTurn.speakers[0].intent, 'ASK_FOLLOWUP');
  assert.equal(endTurn.speakers[0].transitionToDel3, true);
});

test('Personas & Speech Helpers: templates, prompts, word counting, and MIME extensions', () => {
  assert.equal(countWords('  Hei   på  deg  '), 3);
  assert.equal(countWords(''), 0);

  const greet = templateLine(
    { persona: 'examiner', intent: 'GREET_AND_TASK' },
    {
      level: 'B1',
      mode: 'AI_PEER',
      topic: SAMPLE_TOPIC,
      transcript: [],
    }
  );
  assert.ok(greet && greet.includes('B1') && greet.includes(SAMPLE_TOPIC.titleNo));

  const promptObj = buildPrompt(
    { persona: 'co_candidate', intent: 'PEER_REPLY' },
    {
      level: 'B2',
      mode: 'AI_PEER',
      topic: SAMPLE_TOPIC,
      transcript: [
        {
          speaker: 'CANDIDATE_1',
          role: 'CANDIDATE_1',
          text: 'Jeg mener kollektivtransport er viktig.',
          timestamp: 1000,
        },
      ],
    }
  );
  assert.ok(promptObj.system.includes('B2'));
  assert.ok(promptObj.prompt.includes('Jeg mener kollektivtransport er viktig.'));

  assert.equal(extensionForMime('audio/m4a'), 'm4a');
  assert.equal(extensionForMime('audio/webm;codecs=opus'), 'webm');
  assert.equal(extensionForMime(undefined, 'recording.wav'), 'wav');
});

test('Mobile Audio Upload: Expo SDK 57 FormData part with .bytes() serializes to valid multipart/form-data for Next.js route handler', async () => {
  const { convertFormDataAsync } = await import(
    '../node_modules/expo/src/winter/fetch/convertFormData'
  );

  const sampleAudioBytes = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);
  const form = new FormData();
  form.append('durationMs', '4200');
  form.append('speaker', 'CANDIDATE_1');

  // Simulate Expo Go native FormData entries with .bytes(), .name, .type, .uri
  const nativePart = {
    uri: 'file:///data/user/0/host.exp.exponent/cache/Audio/recording-123.m4a',
    name: 'answer.m4a',
    type: 'audio/m4a',
    bytes: async () => sampleAudioBytes,
  };

  const fakeExpoFormData = {
    entries: function* () {
      yield ['durationMs', '4200'];
      yield ['speaker', 'CANDIDATE_1'];
      yield ['audio', nativePart];
    },
  } as unknown as FormData;

  const { body, boundary } = await convertFormDataAsync(fakeExpoFormData);
  assert.ok(body.byteLength > sampleAudioBytes.byteLength);

  // Verify Next.js Web Request.formData() parses the multipart payload into a valid File/Blob
  const req = new Request('http://localhost:3000/api/exam/test/turn', {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: body as unknown as BodyInit,
  });

  const parsedForm = (await req.formData()) as unknown as {
    get(name: string): unknown;
  };
  assert.equal(parsedForm.get('durationMs'), '4200');
  assert.equal(parsedForm.get('speaker'), 'CANDIDATE_1');

  const audioField = parsedForm.get('audio') as File | null;
  assert.ok(audioField && typeof audioField === 'object' && 'arrayBuffer' in audioField);
  assert.equal(audioField.name, 'answer.m4a');
  assert.equal(audioField.type, 'audio/m4a');
  const receivedBytes = new Uint8Array(await audioField.arrayBuffer());
  assert.deepEqual(Array.from(receivedBytes), Array.from(sampleAudioBytes));
});


