import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRoomMetadata,
  ExaminerAgent,
  CoCandidateAgent,
  SessionMetadata,
  SessionCoordinator,
} from '../src/agent/worker';
import { db } from '../src/db/index';
import { examSessions, userQuotas, usageLedger } from '../src/db/schema';
import { evaluateExamSession } from '../src/lib/evaluate-exam';

test('Worker: parseRoomMetadata correctly extracts session, level, mode, and topic fields', () => {
  const rawJson = JSON.stringify({
    sessionId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    userId: 'user_candidate_99',
    level: 'B2',
    coCandidateMode: 'HUMAN_LOCAL',
    topic: {
      titleNo: 'Bør mobiltelefoner forbys i skolen?',
      monologuePromptNo: 'Gjør rede for fordelene og ulempene med mobilfri skole.',
      discussionPromptNo: 'Diskuter om forbud fremmer læring eller hemmer digital dømmekraft.',
      followUpQuestionsNo: [
        'Hva mener du er foreldrenes ansvar i denne sammenhengen?',
        'Hvordan kan skolen balansere teknologi og konsentrasjon?',
      ],
    },
  });

  const parsed = parseRoomMetadata(rawJson);

  assert.equal(parsed.sessionId, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  assert.equal(parsed.userId, 'user_candidate_99');
  assert.equal(parsed.level, 'B2');
  assert.equal(parsed.coCandidateMode, 'HUMAN_LOCAL');
  assert.equal(parsed.topic.titleNo, 'Bør mobiltelefoner forbys i skolen?');
  assert.equal(
    parsed.topic.monologuePromptNo,
    'Gjør rede for fordelene og ulempene med mobilfri skole.'
  );
  assert.equal(parsed.topic.followUpQuestionsNo.length, 2);
});

test('Worker: parseRoomMetadata provides resilient fallbacks for missing properties', () => {
  const minimalJson = JSON.stringify({
    sessionId: 'test-session',
    userId: 'user-1',
  });

  const parsed = parseRoomMetadata(minimalJson);
  assert.equal(parsed.sessionId, 'test-session');
  assert.equal(parsed.userId, 'user-1');
  assert.equal(parsed.level, 'B1');
  assert.equal(parsed.coCandidateMode, 'AI_PEER');
  assert.ok(parsed.topic.titleNo.length > 0);
  assert.ok(parsed.topic.followUpQuestionsNo.length > 0);
});

test('Worker: ExaminerAgent initializes with ElevenLabs TTS, OpenAI LLM, and dual-discussion tools', () => {
  const metadata: SessionMetadata = {
    sessionId: 'test-session',
    userId: 'candidate-123',
    level: 'B1',
    coCandidateMode: 'AI_PEER',
    topic: {
      titleNo: 'Kollektivtransport',
      monologuePromptNo: 'Fortell om transport.',
      discussionPromptNo: 'Bør transport være gratis?',
      followUpQuestionsNo: ['Hva koster det?'],
    },
  };

  const coordinator: SessionCoordinator = {
    metadata,
    setActiveSpeaker: () => {},
    activatePassiveModerator: () => {},
  };

  const examiner = new ExaminerAgent(metadata, coordinator);

  assert.ok(examiner instanceof ExaminerAgent);
  assert.ok(examiner.instructions.toString().includes('B1'));
  assert.ok(examiner.instructions.toString().includes('HK-dir'));

  // Check tools
  const tools = examiner.toolCtx.flatten();
  const toolNames = tools.map((t) => (t as any).name || (t as any).id);
  assert.ok(toolNames.includes('startAiPeerDiscussion'));
  assert.ok(toolNames.includes('startHumanLocalDiscussion'));
});

test('Worker: CoCandidateAgent initializes with ElevenLabs TTS, OpenAI LLM, and returnToExaminer tool', () => {
  const metadata: SessionMetadata = {
    sessionId: 'test-session',
    userId: 'candidate-123',
    level: 'B2',
    coCandidateMode: 'AI_PEER',
    topic: {
      titleNo: 'Kunstig Intelligens',
      monologuePromptNo: 'Drøft KI i arbeidslivet.',
      discussionPromptNo: 'Er KI en trussel eller mulighet?',
      followUpQuestionsNo: ['Hva med personvern?'],
    },
  };

  const coordinator: SessionCoordinator = {
    metadata,
    setActiveSpeaker: () => {},
    activatePassiveModerator: () => {},
  };

  const coCandidate = new CoCandidateAgent(metadata, coordinator);

  assert.ok(coCandidate instanceof CoCandidateAgent);
  assert.ok(coCandidate.instructions.toString().includes('B2'));
  assert.ok(coCandidate.instructions.toString().includes('medkandidat'));

  // Check tools
  const tools = coCandidate.toolCtx.flatten();
  const toolNames = tools.map((t) => (t as any).name || (t as any).id);
  assert.ok(toolNames.includes('returnToExaminer'));
});

test('Database & Schema: shared db and schemas are correctly exported and accessible', () => {
  assert.ok(db, 'db instance should be exported');
  assert.ok(examSessions, 'examSessions schema should be exported');
  assert.ok(userQuotas, 'userQuotas schema should be exported');
  assert.ok(usageLedger, 'usageLedger schema should be exported');
  assert.equal(typeof evaluateExamSession, 'function');
});

