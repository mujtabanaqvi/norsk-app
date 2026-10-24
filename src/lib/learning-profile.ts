import { generateObject } from 'ai';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  getActiveAiProvider,
  getEvaluationModel,
  getEvaluationModelName,
  isProviderConfigured,
} from '../server/ai-provider';
import { db } from '../db/index';
import { examSessions, learningProfiles, userQuotas } from '../db/schema';
import type { ExamEvaluation } from '../types/exam';
import { CRITERION_KEYS, type LearningCoach, type LearningInsight } from '../types/learning-profile';
import {
  PASS_MARK,
  PROFILE_WINDOW,
  CRITERION_TITLES,
  buildOfflineCoach,
  candidateAverage,
  computeProfileStats,
  groupRecurringMistakes,
  pickUserCandidate,
  type ProfileSample,
} from './learning-profile-stats';

// Same gpt-4o rates as evaluate-exam.ts
const PROMPT_RATE_PER_TOKEN = 2.5 / 1_000_000;
const COMPLETION_RATE_PER_TOKEN = 10.0 / 1_000_000;

const CoachSchema = z.object({
  statusNo: z.string().describe('2–3 setninger på norsk: hvor kandidaten står nå, utvikling over tid, og hva som skiller dem fra målnivået'),
  statusEn: z.string().describe('The same 2–3 sentence status in English'),
  strengths: z
    .array(z.object({ no: z.string(), en: z.string() }))
    .describe('1–3 consistent strengths seen across the exams, each one short sentence in Norwegian and English'),
  focusAreas: z
    .array(
      z.object({
        criterion: z.enum(CRITERION_KEYS),
        titleNo: z.string().describe('Kort, konkret tittel på norsk, f.eks. «Verbet på plass to etter tidsuttrykk»'),
        titleEn: z.string(),
        adviceNo: z.string().describe('2–3 setninger med konkret øvingsråd på norsk, gjerne med et eksempel'),
        adviceEn: z.string(),
      })
    )
    .describe('2–3 prioritised improvement areas, most impactful first'),
  recurringMistakes: z
    .array(
      z.object({
        pattern: z.string().describe('Name of the recurring error pattern, Norwegian term with English in parentheses'),
        example: z.string().describe('An exact quote from the corrections that shows the pattern'),
        fix: z.string().describe('The corrected Norwegian for that quote'),
      })
    )
    .describe('Up to 3 error patterns that recur across several exams (not one-off slips)'),
  nextStepNo: z.string().describe('Én konkret ting kandidaten skal gjøre i neste prøve'),
  nextStepEn: z.string(),
});

const COACH_SYSTEM_PROMPT = `Du er en erfaren norsklærer og sensor som coacher en kandidat mot Norskprøven muntlig (B1/B2).
Du får sammendrag, poeng (1–10 per kriterium) og konkrete rettelser fra kandidatens siste prøver, nyeste først.
Skalaen: 1–4 = under B1, 5–7 = B1, 8–9 = B2, 10 = over B2.

Oppgaven din:
- Se etter MØNSTRE på tvers av prøvene, ikke gjenta enkeltprøver.
- Prioriter det som gir størst effekt for å nå målnivået.
- Vær ærlig, varm og konkret. Gi råd kandidaten kan øve på i morgen.
- Skriv alt både på norsk (bokmål) og engelsk.`;

interface SessionSampleRow {
  id: string;
  evaluationJson: ExamEvaluation | null;
}

function toSamples(rows: SessionSampleRow[]): ProfileSample[] {
  return rows.flatMap((r) => {
    const candidate = pickUserCandidate(r.evaluationJson);
    return candidate ? [{ sessionId: r.id, candidate }] : [];
  });
}

function buildCoachPrompt(samples: ProfileSample[], stats: LearningInsight['stats']): string {
  const exams = samples
    .map((s, i) => {
      const c = s.candidate;
      const scores = CRITERION_KEYS.map((k) => `${CRITERION_TITLES[k].no}: ${c.criteriaScores[k].score}`).join(', ');
      const corrections = (c.concreteCorrections ?? [])
        .map((x) => `  - «${x.originalQuote}» → «${x.correctedNorwegian}» (${x.grammarOrVocabRule})`)
        .join('\n');
      return `Prøve ${i + 1} (${i === 0 ? 'nyeste' : `${i} før`}): målnivå ${c.targetLevel}, vurdert ${c.assessedLevel}, snitt ${candidateAverage(c)}
Poeng: ${scores}
Sammendrag: ${c.overallSummaryNo}
Rettelser:
${corrections || '  (ingen)'}`;
    })
    .join('\n\n');

  const averages = CRITERION_KEYS.map(
    (k) => `${CRITERION_TITLES[k].no}: ${stats.criterionAverages[k]} (trend: ${stats.criterionTrend[k]})`
  ).join('\n');

  return `Målnivå: ${stats.targetLevel} (krever snitt på ca. ${PASS_MARK[stats.targetLevel]})
Nåværende nivå: ${stats.currentLevel}, snitt ${stats.recentAvg}, bestått ${Math.round(stats.passRate * 100)} % av de siste ${stats.sampleSize} prøvene
Snitt per kriterium:
${averages}

${exams}`;
}

async function generateCoach(
  samples: ProfileSample[],
  stats: LearningInsight['stats'],
  userId: string
): Promise<{ coach: LearningCoach; generatedBy: LearningInsight['generatedBy'] }> {
  if (!isProviderConfigured()) {
    return { coach: buildOfflineCoach(stats, samples), generatedBy: 'offline' };
  }

  try {
    const result = await generateObject({
      model: getEvaluationModel(),
      schema: CoachSchema,
      system: COACH_SYSTEM_PROMPT,
      prompt: buildCoachPrompt(samples, stats),
      ...(getActiveAiProvider() === 'azure' ? {} : { temperature: 0.3 }),
    });

    const usage = result.usage as any;
    const promptTokens: number = usage?.promptTokens ?? usage?.inputTokens ?? 0;
    const completionTokens: number = usage?.completionTokens ?? usage?.outputTokens ?? 0;
    await recordCoachUsage(userId, promptTokens, completionTokens);

    const coach = result.object;
    if (!coach.recurringMistakes.length) coach.recurringMistakes = groupRecurringMistakes(samples);
    return { coach, generatedBy: 'llm' };
  } catch (err) {
    console.error(`[LearningProfile] Coach generation failed for user ${userId}, using offline coach:`, err);
    return { coach: buildOfflineCoach(stats, samples), generatedBy: 'offline' };
  }
}

/** Not tied to one exam, so it goes on the user's quota totals rather than a session ledger row. */
async function recordCoachUsage(userId: string, promptTokens: number, completionTokens: number) {
  const totalTokens = promptTokens + completionTokens;
  if (!totalTokens) return;
  const cost = (promptTokens * PROMPT_RATE_PER_TOKEN + completionTokens * COMPLETION_RATE_PER_TOKEN).toFixed(6);
  console.log(
    `[LearningProfile] Coach for ${userId} via ${getEvaluationModelName()} (Tokens: ${totalTokens}, Cost: $${cost})`
  );
  await db
    .insert(userQuotas)
    .values({ userId, totalLlmTokensUsed: totalTokens, totalCostUsd: cost, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userQuotas.userId,
      set: {
        totalLlmTokensUsed: sql`${userQuotas.totalLlmTokensUsed} + ${totalTokens}`,
        totalCostUsd: sql`(${userQuotas.totalCostUsd} + ${cost}::numeric)`,
        updatedAt: new Date(),
      },
    });
}

/**
 * Recompute the user's learning profile from their latest evaluated exams and persist it.
 * Called after every evaluation; returns null when there is nothing to summarise yet.
 */
export async function updateLearningProfile(
  userId: string
): Promise<{ insight: LearningInsight; basedOnSessionIds: string[]; updatedAt: Date } | null> {
  const rows = await db
    .select({ id: examSessions.id, evaluationJson: examSessions.evaluationJson })
    .from(examSessions)
    .where(
      and(
        eq(examSessions.userId, userId),
        eq(examSessions.status, 'COMPLETED'),
        sql`${examSessions.evaluationJson} is not null`
      )
    )
    .orderBy(desc(examSessions.completedAt));

  const allSamples = toSamples(rows);
  if (!allSamples.length) return null;

  const samples = allSamples.slice(0, PROFILE_WINDOW);
  const stats = computeProfileStats(samples, allSamples.length);
  const { coach, generatedBy } = await generateCoach(samples, stats, userId);

  const insight: LearningInsight = { stats, coach, generatedBy, generatedAt: new Date().toISOString() };
  const basedOnSessionIds = samples.map((s) => s.sessionId);
  const updatedAt = new Date();

  await db
    .insert(learningProfiles)
    .values({ userId, insightJson: insight, basedOnSessionIds, updatedAt })
    .onConflictDoUpdate({
      target: learningProfiles.userId,
      set: { insightJson: insight, basedOnSessionIds, updatedAt },
    });

  console.log(`[LearningProfile] Updated profile for ${userId} from ${samples.length} exams (${generatedBy})`);
  return { insight, basedOnSessionIds, updatedAt };
}
