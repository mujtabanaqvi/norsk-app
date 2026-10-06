import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateExamSession,
  ExamEvaluationSchema,
  CandidateEvaluationSchema,
  CriterionScoreSchema,
  ConcreteCorrectionSchema,
  ExamEvaluation,
  CandidateEvaluation,
} from '../src/lib/evaluate-exam';

test('Evaluate Exam: ExamEvaluationSchema parses valid AI_PEER single-candidate evaluation', () => {
  const sampleEvaluation: ExamEvaluation = {
    candidates: [
      {
        speakerRole: 'CANDIDATE_1',
        targetLevel: 'B1',
        assessedLevel: 'B1',
        passedTargetLevel: true,
        overallSummaryNo:
          'Kandidaten viste god forståelse for oppgaven og klarte å formidle sine synspunkter på en forståelig måte.',
        overallSummaryEn:
          'The candidate demonstrated good comprehension of the prompt and conveyed viewpoints comprehensibly.',
        criteriaScores: {
          formidlingOgFlyt: {
            score: 7,
            feedbackNo: 'God flyt og naturlig turtaking gjennom hele samtalen.',
            feedbackEn: 'Good fluency and natural turn-taking throughout the dialogue.',
          },
          uttaleOgForstaelighet: {
            score: 6,
            feedbackNo: 'Klar uttale med enkelte aksentpregede lyder.',
            feedbackEn: 'Clear pronunciation with minor accent-influenced phonemes.',
          },
          ordforrad: {
            score: 7,
            feedbackNo: 'Variert ordforråd tilpasset dagligliv og samfunn.',
            feedbackEn: 'Varied vocabulary suited for everyday life and society.',
          },
          grammatikkOgSetningsstruktur: {
            score: 6,
            feedbackNo: 'God kontroll over hovedsetninger; enkelte V2-glipp etter forfelt.',
            feedbackEn: 'Good control of main clauses; occasional V2 slips following sentence-initial adverbials.',
          },
        },
        concreteCorrections: [
          {
            originalQuote: 'I går jeg reiste med buss.',
            correctedNorwegian: 'I går reiste jeg med buss.',
            grammarOrVocabRule:
              'V2-regelen: Verbet må stå på plass 2 etter tidsadverbial. / V2 rule: The finite verb must be in second position after time adverbials.',
          },
          {
            originalQuote: '...fordi jeg har ikke tid.',
            correctedNorwegian: '...fordi jeg ikke har tid.',
            grammarOrVocabRule:
              'Leddsetningsordstilling: Setningsadverbialet "ikke" står foran verbet i leddsetninger. / Subordinate clause word order: "ikke" precedes the finite verb in subclauses.',
          },
        ],
      },
    ],
    evaluatedAt: new Date().toISOString(),
  };

  const parseResult = ExamEvaluationSchema.safeParse(sampleEvaluation);
  assert.equal(parseResult.success, true);
  if (parseResult.success) {
    assert.equal(parseResult.data.candidates.length, 1);
    assert.equal(parseResult.data.candidates[0].speakerRole, 'CANDIDATE_1');
    assert.equal(parseResult.data.candidates[0].targetLevel, 'B1');
    assert.equal(parseResult.data.candidates[0].assessedLevel, 'B1');
    assert.equal(parseResult.data.candidates[0].passedTargetLevel, true);
    assert.equal(parseResult.data.candidates[0].criteriaScores.formidlingOgFlyt.score, 7);
  }
});

test('Evaluate Exam: ExamEvaluationSchema parses valid HUMAN_LOCAL dual-candidate evaluation', () => {
  const sampleDualEvaluation: ExamEvaluation = {
    candidates: [
      {
        speakerRole: 'CANDIDATE_1',
        targetLevel: 'B2',
        assessedLevel: 'B2',
        passedTargetLevel: true,
        overallSummaryNo: 'Kandidat 1 argumenterte nyansert og tok initiativ i diskusjonen.',
        overallSummaryEn: 'Candidate 1 argued with nuance and took active initiative in discussion.',
        criteriaScores: {
          formidlingOgFlyt: { score: 8, feedbackNo: 'Jevnt tempo.', feedbackEn: 'Steady tempo.' },
          uttaleOgForstaelighet: { score: 8, feedbackNo: 'Tydelig uttale.', feedbackEn: 'Clear pronunciation.' },
          ordforrad: { score: 9, feedbackNo: 'Presise begreper.', feedbackEn: 'Precise terms.' },
          grammatikkOgSetningsstruktur: { score: 8, feedbackNo: 'God V2-kontroll.', feedbackEn: 'Strong V2 control.' },
        },
        concreteCorrections: [
          {
            originalQuote: 'Dette er et viktig poeng.',
            correctedNorwegian: 'Dette er et vesentlig poeng.',
            grammarOrVocabRule: 'Vokabularvariasjon på B2. / Vocabulary nuance at B2 level.',
          },
        ],
      },
      {
        speakerRole: 'CANDIDATE_2',
        targetLevel: 'B2',
        assessedLevel: 'B1',
        passedTargetLevel: false,
        overallSummaryNo: 'Kandidat 2 forsto oppgaven godt, men slet med å drøfte motargumenter.',
        overallSummaryEn: 'Candidate 2 understood the task well, but struggled to discuss counterarguments.',
        criteriaScores: {
          formidlingOgFlyt: { score: 6, feedbackNo: 'En del nøling.', feedbackEn: 'Noticeable hesitation.' },
          uttaleOgForstaelighet: { score: 6, feedbackNo: 'God forståelighet.', feedbackEn: 'Good comprehensibility.' },
          ordforrad: { score: 5, feedbackNo: 'Enkle ordvalg.', feedbackEn: 'Basic vocabulary choices.' },
          grammatikkOgSetningsstruktur: { score: 5, feedbackNo: 'Mange V2-feil.', feedbackEn: 'Frequent V2 errors.' },
        },
        concreteCorrections: [
          {
            originalQuote: 'I fremtiden vi vil se endringer.',
            correctedNorwegian: 'I fremtiden vil vi se endringer.',
            grammarOrVocabRule: 'Inversjon (V2) kreves etter forfelt. / Inversion (V2) required after initial adverbial.',
          },
        ],
      },
    ],
    evaluatedAt: new Date().toISOString(),
  };

  const parseResult = ExamEvaluationSchema.safeParse(sampleDualEvaluation);
  assert.equal(parseResult.success, true);
  if (parseResult.success) {
    assert.equal(parseResult.data.candidates.length, 2);
    assert.equal(parseResult.data.candidates[0].speakerRole, 'CANDIDATE_1');
    assert.equal(parseResult.data.candidates[1].speakerRole, 'CANDIDATE_2');
    assert.equal(parseResult.data.candidates[0].passedTargetLevel, true);
    assert.equal(parseResult.data.candidates[1].passedTargetLevel, false);
  }
});

test('Evaluate Exam: Schema rejects out-of-range scores and invalid enum values', () => {
  // Score > 10 should be rejected
  const invalidScoreAbove = CriterionScoreSchema.safeParse({
    score: 11,
    feedbackNo: 'Test',
    feedbackEn: 'Test',
  });
  assert.equal(invalidScoreAbove.success, false);

  // Score < 1 should be rejected
  const invalidScoreBelow = CriterionScoreSchema.safeParse({
    score: 0,
    feedbackNo: 'Test',
    feedbackEn: 'Test',
  });
  assert.equal(invalidScoreBelow.success, false);

  // Invalid assessed level
  const invalidLevel = CandidateEvaluationSchema.safeParse({
    speakerRole: 'CANDIDATE_1',
    targetLevel: 'B1',
    assessedLevel: 'C1', // Invalid! Only Under B1, B1, B2, Over B2
    passedTargetLevel: true,
    overallSummaryNo: 'Test',
    overallSummaryEn: 'Test',
    criteriaScores: {
      formidlingOgFlyt: { score: 5, feedbackNo: 'ok', feedbackEn: 'ok' },
      uttaleOgForstaelighet: { score: 5, feedbackNo: 'ok', feedbackEn: 'ok' },
      ordforrad: { score: 5, feedbackNo: 'ok', feedbackEn: 'ok' },
      grammatikkOgSetningsstruktur: { score: 5, feedbackNo: 'ok', feedbackEn: 'ok' },
    },
    concreteCorrections: [],
  });
  assert.equal(invalidLevel.success, false);

  // Invalid speaker role
  const invalidRole = CandidateEvaluationSchema.safeParse({
    speakerRole: 'EXAMINER', // Invalid! Only CANDIDATE_1 or CANDIDATE_2
    targetLevel: 'B1',
    assessedLevel: 'B1',
    passedTargetLevel: true,
    overallSummaryNo: 'Test',
    overallSummaryEn: 'Test',
    criteriaScores: {
      formidlingOgFlyt: { score: 5, feedbackNo: 'ok', feedbackEn: 'ok' },
      uttaleOgForstaelighet: { score: 5, feedbackNo: 'ok', feedbackEn: 'ok' },
      ordforrad: { score: 5, feedbackNo: 'ok', feedbackEn: 'ok' },
      grammatikkOgSetningsstruktur: { score: 5, feedbackNo: 'ok', feedbackEn: 'ok' },
    },
    concreteCorrections: [],
  });
  assert.equal(invalidRole.success, false);
});

test('Evaluate Exam: evaluateExamSession function signature and error handling', async () => {
  assert.equal(typeof evaluateExamSession, 'function');

  // Passing non-existent UUID session should throw clean error
  const fakeSessionId = '00000000-0000-0000-0000-000000000000';
  await assert.rejects(
    async () => {
      await evaluateExamSession(fakeSessionId);
    },
    {
      name: 'Error',
      message: `Exam session with ID "${fakeSessionId}" not found.`,
    }
  );
});

test('Evaluate Exam: handles empty transcript cleanly without throwing and writes insufficient data note', async () => {
  const { db } = await import('../src/db/index');
  const { examSessions, userQuotas, usageLedger } = await import('../src/db/schema');
  const { eq } = await import('drizzle-orm');

  const testUserId = 'test_empty_eval_user';
  // Ensure user quota exists
  await db
    .insert(userQuotas)
    .values({
      userId: testUserId,
      remainingAudioSeconds: 1800,
    })
    .onConflictDoNothing();

  // Create an exam session with empty transcript
  const [session] = await db
    .insert(examSessions)
    .values({
      userId: testUserId,
      level: 'B1',
      coCandidateMode: 'AI_PEER',
      status: 'COMPLETED',
      transcriptJson: [],
    })
    .returning();

  try {
    // Should complete cleanly (Promise<void>)
    await evaluateExamSession(session.id);

    // Verify evaluationJson was marked with insufficient data
    const [updated] = await db
      .select()
      .from(examSessions)
      .where(eq(examSessions.id, session.id))
      .limit(1);

    assert.ok(updated.evaluationJson);
    assert.equal(updated.evaluationJson.insufficientData, true);
    assert.equal(updated.evaluationJson.candidates.length, 1);
    assert.equal(updated.evaluationJson.candidates[0].passedTargetLevel, false);
    assert.equal(updated.evaluationJson.candidates[0].assessedLevel, 'Under B1');
    assert.ok(updated.evaluationJson.candidates[0].overallSummaryNo.includes('Utilstrekkelig'));
  } finally {
    // Clean up test session
    await db.delete(examSessions).where(eq(examSessions.id, session.id));
    await db.delete(userQuotas).where(eq(userQuotas.userId, testUserId));
  }
});

test('Evaluate Exam: evaluates session with transcript, updates ledger and quota atomically', async () => {
  const { db } = await import('../src/db/index');
  const { examSessions, userQuotas, usageLedger } = await import('../src/db/schema');
  const { eq } = await import('drizzle-orm');

  const testUserId = 'test_eval_tx_user';
  await db
    .insert(userQuotas)
    .values({
      userId: testUserId,
      remainingAudioSeconds: 1800,
    })
    .onConflictDoNothing();

  // Create an exam session with realistic transcript
  const [session] = await db
    .insert(examSessions)
    .values({
      userId: testUserId,
      level: 'B2',
      coCandidateMode: 'HUMAN_LOCAL',
      status: 'COMPLETED',
      transcriptJson: [
        {
          speaker: 'examiner',
          role: 'EXAMINER',
          text: 'Velkommen til prøven. Hva mener dere om kollektivtransport?',
          timestamp: 1000,
        },
        {
          speaker: 'candidate 1',
          role: 'CANDIDATE_1',
          text: 'Jeg mener at kollektivtransport bør være gratis i store byer fordi det reduserer forurensning og gjør at flere velger buss framfor bil i hverdagen.',
          timestamp: 5000,
        },
        {
          speaker: 'candidate 2',
          role: 'CANDIDATE_2',
          text: 'Jeg er enig i at miljøgevinsten er stor, men vi må også drøfte finansieringen. Gratis buss koster mange milliarder kroner årlig.',
          timestamp: 12000,
        },
      ],
    })
    .returning();

  try {
    await evaluateExamSession(session.id);

    // Verify session evaluationJson
    const [updatedSession] = await db
      .select()
      .from(examSessions)
      .where(eq(examSessions.id, session.id))
      .limit(1);

    assert.ok(updatedSession.evaluationJson);
    const evalData = updatedSession.evaluationJson;
    assert.equal(evalData.candidates.length, 2);
    assert.equal(evalData.candidates[0].speakerRole, 'CANDIDATE_1');
    assert.equal(evalData.candidates[1].speakerRole, 'CANDIDATE_2');
    assert.equal(typeof evalData.candidates[0].criteriaScores.formidlingOgFlyt.score, 'number');
    assert.ok(evalData.candidates[0].concreteCorrections.length > 0);

    // Verify usage ledger entry
    const ledgerRows = await db
      .select()
      .from(usageLedger)
      .where(eq(usageLedger.sessionId, session.id));

    assert.equal(ledgerRows.length, 1);
    assert.equal(ledgerRows[0].source, 'POST_EXAM_RUBRIC_EVAL');
    assert.equal(ledgerRows[0].llmModel, 'gpt-4o');
    assert.ok(ledgerRows[0].llmPromptTokens > 0);
    assert.ok(ledgerRows[0].llmCompletionTokens > 0);
    assert.ok(parseFloat(ledgerRows[0].estimatedCostUsd) > 0);

    // Verify user quota updated
    const [updatedQuota] = await db
      .select()
      .from(userQuotas)
      .where(eq(userQuotas.userId, testUserId))
      .limit(1);

    assert.ok(updatedQuota.totalLlmTokensUsed > 0);
    assert.ok(parseFloat(updatedQuota.totalCostUsd) > 0);
  } finally {
    await db.delete(usageLedger).where(eq(usageLedger.sessionId, session.id));
    await db.delete(examSessions).where(eq(examSessions.id, session.id));
    await db.delete(userQuotas).where(eq(userQuotas.userId, testUserId));
  }
});

