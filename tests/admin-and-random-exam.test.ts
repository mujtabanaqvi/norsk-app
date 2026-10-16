import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickRandomExamTopic,
  pickRandomFollowUpQuestions,
  slugifyNorwegianTitle,
} from '../src/server/exam-randomizer';

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

