import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeExam,
  pickRandomExamTopic,
  pickRandomFollowUpQuestions,
  slugifyNorwegianTitle,
} from '../src/server/exam-randomizer';

function makeSet(id: string, themeId: string | null, questionCount = 3) {
  return {
    id,
    themeId,
    followUpQuestionsNo: Array.from({ length: questionCount }, (_, i) => `${id} spørsmål ${i + 1}?`),
  };
}

const THEMED_POOL = [
  makeSet('fam-1', 'familie'),
  makeSet('fam-2', 'familie'),
  makeSet('mil-1', 'miljo'),
  makeSet('mil-2', 'miljo'),
  makeSet('tra-1', 'transport'),
  makeSet('sko-1', 'skole'),
];

describe('composeExam', () => {
  it('returns null for an empty pool or an unknown theme', () => {
    assert.equal(composeExam([]), null);
    assert.equal(composeExam(THEMED_POOL, { themeId: 'finnes-ikke' }), null);
  });

  it('keeps every part inside the chosen theme', () => {
    const familySetIds = new Set(['fam-1', 'fam-2']);
    for (let i = 0; i < 30; i++) {
      const exam = composeExam(THEMED_POOL, { themeId: 'familie' });
      assert.ok(exam);
      assert.ok(familySetIds.has(exam.monologueSet.id));
      assert.ok(familySetIds.has(exam.discussionSet.id));
      assert.notEqual(exam.monologueSet.id, exam.discussionSet.id, 'prefers two different sets');
      assert.deepEqual(exam.followUpThemeIds, ['familie']);
      assert.ok(exam.followUpQuestionsNo.length <= 3);
      assert.equal(new Set(exam.followUpQuestionsNo).size, exam.followUpQuestionsNo.length);
      for (const q of exam.followUpQuestionsNo) {
        assert.ok(q.startsWith('fam-'), `follow-up "${q}" comes from the family theme`);
      }
    }
  });

  it('draws each part from a different theme in random mode when >= 3 themes exist', () => {
    const seenThemes = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const exam = composeExam(THEMED_POOL);
      assert.ok(exam);
      const del1 = exam.monologueSet.themeId!;
      const del2 = exam.discussionSet.themeId!;
      const del3 = exam.followUpThemeIds[0];
      assert.equal(new Set([del1, del2, del3]).size, 3, 'Del 1, Del 2 and Del 3 use distinct themes');
      for (const q of exam.followUpQuestionsNo) {
        const sourceSet = THEMED_POOL.find((s) => q.startsWith(s.id))!;
        assert.equal(sourceSet.themeId, del3);
      }
      seenThemes.add(del1);
    }
    assert.ok(seenThemes.size > 1, 'Del 1 theme varies between attempts');
  });

  it('wraps around and still composes an exam with fewer than 3 themes', () => {
    const twoThemes = [makeSet('a-1', 'a'), makeSet('a-2', 'a'), makeSet('b-1', 'b')];
    for (let i = 0; i < 20; i++) {
      const exam = composeExam(twoThemes);
      assert.ok(exam);
      assert.notEqual(exam.monologueSet.themeId, exam.discussionSet.themeId);
      assert.ok(exam.followUpQuestionsNo.length > 0);
    }

    const singleSet = [makeSet('only', null)];
    const exam = composeExam(singleSet);
    assert.ok(exam);
    assert.equal(exam.monologueSet.id, 'only');
    assert.equal(exam.discussionSet.id, 'only');
    assert.equal(exam.followUpQuestionsNo.length, 3);
  });
});

describe('exam-randomizer & admin helpers', () => {
  it('pickRandomExamTopic returns null for empty list and single element for 1-item list', () => {
    assert.equal(pickRandomExamTopic([]), null);
    const single = { id: '1', titleNo: 'Miljø' };
    assert.deepEqual(pickRandomExamTopic([single]), single);
  });

  it('pickRandomExamTopic selects from the provided active pool', () => {
    const pool = [
      { id: '1', titleNo: 'Tema A' },
      { id: '2', titleNo: 'Tema B' },
      { id: '3', titleNo: 'Tema C' },
    ];
    const pickedIds = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const picked = pickRandomExamTopic(pool);
      assert.ok(picked);
      assert.ok(pool.some((p) => p.id === picked.id));
      pickedIds.add(picked.id);
    }
    assert.ok(pickedIds.size > 1, 'Expected random selection to pick more than 1 distinct topic over 40 runs');
  });

  it('pickRandomFollowUpQuestions draws at most maxCount non-empty questions from pool', () => {
    const questions = [
      'Spørsmål 1?',
      'Spørsmål 2?',
      'Spørsmål 3?',
      'Spørsmål 4?',
      'Spørsmål 5?',
      '   ',
    ];
    const selected = pickRandomFollowUpQuestions(questions, 3);
    assert.equal(selected.length, 3);
    const unique = new Set(selected);
    assert.equal(unique.size, 3);
    for (const q of selected) {
      assert.ok(questions.includes(q));
    }
  });

  it('slugifyNorwegianTitle handles Norwegian characters æ, ø, å cleanly', () => {
    assert.equal(
      slugifyNorwegianTitle('Miljø og bærekraft i vår hverdag!'),
      'miljo-og-baerekraft-i-var-hverdag'
    );
    assert.equal(
      slugifyNorwegianTitle('Økonomi, Ærlighet & Åpenhet'),
      'okonomi-aerlighet-apenhet'
    );
  });
});

