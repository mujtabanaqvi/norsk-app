import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { db, pool } from './index';
import { examThemes, examTopics, userQuotas, tierConfigs, systemConfigs } from './schema';
import { DEFAULT_TIER_CONFIGS, DEFAULT_REFERRAL_CONFIG } from '../../lib/tier-policy';
import { sql } from 'drizzle-orm';

export const SAMPLE_THEMES = [
  {
    slug: 'familie-og-barn',
    titleNo: 'Familie og barn',
    descriptionNo: 'Familieliv, oppvekst, barneoppdragelse og generasjoner.',
    sortOrder: 0,
  },
  {
    slug: 'miljo-og-natur',
    titleNo: 'Miljø og natur',
    descriptionNo: 'Klima, bærekraft, gjenbruk og friluftsliv.',
    sortOrder: 1,
  },
  {
    slug: 'transport-og-bosted',
    titleNo: 'Transport og bosted',
    descriptionNo: 'Kollektivtransport, byliv, distrikt og boforhold.',
    sortOrder: 2,
  },
  {
    slug: 'skole-og-digitalisering',
    titleNo: 'Skole og digitalisering',
    descriptionNo: 'Utdanning, skjermbruk og digitale verktøy.',
    sortOrder: 3,
  },
  {
    slug: 'arbeid-og-teknologi',
    titleNo: 'Arbeid og teknologi',
    descriptionNo: 'Arbeidsliv, kunstig intelligens og fremtidens jobber.',
    sortOrder: 4,
  },
];

export const SAMPLE_TOPICS = [
  {
    slug: 'familieliv-og-hverdag',
    themeSlug: 'familie-og-barn',
    titleNo: 'Familieliv og hverdag',
    level: 'B1' as const,
    monologuePromptNo:
      'Fortell om familien din og hvordan en vanlig hverdag ser ut hjemme hos dere. Hva liker du best med familielivet?',
    discussionPromptNo:
      'Diskuter om barn bør hjelpe til med husarbeid hjemme, og hvor mye ansvar de bør få.',
    followUpQuestionsNo: [
      'Hvordan var familielivet der du vokste opp, sammenlignet med i Norge?',
      'Hva gjør dere sammen som familie i helgene?',
      'Synes du besteforeldre bør ha en stor rolle i barnas liv?',
    ],
    isActive: true,
  },
  {
    slug: 'barneoppdragelse-og-foreldreansvar',
    themeSlug: 'familie-og-barn',
    titleNo: 'Barneoppdragelse og foreldreansvar',
    level: 'B2' as const,
    monologuePromptNo:
      'Drøft hvordan synet på barneoppdragelse har endret seg i Norge de siste generasjonene, og hva som kan forklare endringene.',
    discussionPromptNo:
      'Diskuter om staten i for stor grad blander seg inn i familienes ansvar for barneoppdragelse, for eksempel gjennom barnehage, skole og barnevern.',
    followUpQuestionsNo: [
      'Hvordan kan foreldre finne en god balanse mellom arbeidsliv og familieliv?',
      'Bør foreldrepermisjonen deles likt mellom mor og far?',
      'Hvilke utfordringer møter familier med ulik kulturell bakgrunn i oppdragelsen av barn i Norge?',
    ],
    isActive: true,
  },
  {
    slug: 'miljo-og-baerekraft-i-hverdagen',
    themeSlug: 'miljo-og-natur',
    titleNo: 'Miljø og bærekraft i hverdagen',
    level: 'B1' as const,
    monologuePromptNo:
      'Fortell om hva du og familien din gjør i hverdagen for å ta vare på miljøet. Hvorfor mener du dette er viktig?',
    discussionPromptNo:
      'Diskuter om det bør bli dyrere eller vanskeligere å bruke privatbil i store byer for å beskytte miljøet.',
    followUpQuestionsNo: [
      'Hva synes du er det vanskeligste med å leve miljøvennlig?',
      'Tror du unge mennesker bryr seg mer om miljøet enn eldre?',
      'Hva kan myndighetene gjøre for å hjelpe folk med kildesortering og gjenbruk?',
    ],
    isActive: true,
  },
  {
    slug: 'kollektivtransport-og-byutvikling',
    themeSlug: 'transport-og-bosted',
    titleNo: 'Kollektivtransport og byutvikling',
    level: 'B1' as const,
    monologuePromptNo:
      'Beskriv kollektivtilbudet der du bor. Hva fungerer bra, og hva kan forbedres?',
    discussionPromptNo:
      'Diskuter om kollektivtransport bør være helt gratis for alle innbyggere, finansiert over skatteseddelen.',
    followUpQuestionsNo: [
      'Hvordan reiser du vanligvis til jobb eller skole?',
      'Hvilke tiltak tror du ville fått flere til å la bilen stå hjemme?',
      'Er det rettferdig at folk i distriktene bidrar til kollektivsatsing i storbyene?',
    ],
    isActive: true,
  },
  {
    slug: 'skjermtid-og-mobilforbud-i-skolen',
    themeSlug: 'skole-og-digitalisering',
    titleNo: 'Skjermtid og mobilforbud i skolen',
    level: 'B2' as const,
    monologuePromptNo:
      'Gjør rede for de viktigste argumentene for og imot innføring av et nasjonalt mobil- og skjermforbud i grunnskolen og videregående skole.',
    discussionPromptNo:
      'Diskuter i hvilken grad omfattende digitalisering i skolen fremmer eller hemmer elevenes evne til dyp konsentrasjon, kildekritikk og mellommenneskelig samhandling.',
    followUpQuestionsNo: [
      'Hvilket ansvar bør foreldre ha sammenlignet med skolens ansvar når det gjelder unges skjermbruk?',
      'Hvordan påvirker algoritmestyrt innhold på sosiale medier den offentlige samtalen og demokratiet?',
      'Er det en risiko for at et totalforbud mot digitale verktøy gjør elevene dårligere rustet for et teknologidrevet arbeidsliv?',
    ],
    isActive: true,
  },
  {
    slug: 'kunstig-intelligens-og-fremtidens-arbeidsliv',
    themeSlug: 'arbeid-og-teknologi',
    titleNo: 'Kunstig intelligens og fremtidens arbeidsliv',
    level: 'B2' as const,
    monologuePromptNo:
      'Drøft hvordan framveksten av generativ kunstig intelligens vil transformere det norske arbeidsmarkedet de neste tiårene.',
    discussionPromptNo:
      'Diskuter om innføring av kunstig intelligens primært representerer en trussel mot arbeidstakeres rettigheter og sysselsetting, eller et uvurderlig potensial for økt produktivitet og velferd.',
    followUpQuestionsNo: [
      'Bør myndighetene regulere utviklingen av kunstig intelligens strengere, selv om det kan hemme innovasjonstakten?',
      'Hvilke etiske dilemmaer oppstår når KI benyttes til beslutningstaking i offentlig forvaltning?',
      'Hvordan kan utdanningssystemet omstilles for å forberede fremtidige arbeidstakere på et KI-drevet samfunn?',
    ],
    isActive: true,
  },
];

export const TEST_USER_ID = 'test_user_candidate_1';

export async function seed() {
  console.log('--- Starting idempotent database seed ---');

  await pool.query('ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS engine_state jsonb;');

  // 1. Seed themes (categories) that group the question sets
  const themeIdBySlug = new Map<string, string>();
  for (const theme of SAMPLE_THEMES) {
    const [row] = await db
      .insert(examThemes)
      .values({ ...theme, isActive: true })
      .onConflictDoUpdate({
        target: examThemes.slug,
        set: {
          titleNo: theme.titleNo,
          descriptionNo: theme.descriptionNo,
          sortOrder: theme.sortOrder,
          updatedAt: new Date(),
        },
      })
      .returning({ id: examThemes.id });
    themeIdBySlug.set(theme.slug, row.id);
    console.log(`✓ Seeded theme: ${theme.titleNo} (${theme.slug})`);
  }

  // 2. Seed realistic Norskprøven muntlig question sets (3 B1, 3 B2) linked to their themes
  for (const topic of SAMPLE_TOPICS) {
    const themeId = themeIdBySlug.get(topic.themeSlug) ?? null;
    await db
      .insert(examTopics)
      .values({
        slug: topic.slug,
        themeId,
        titleNo: topic.titleNo,
        level: topic.level,
        monologuePromptNo: topic.monologuePromptNo,
        discussionPromptNo: topic.discussionPromptNo,
        followUpQuestionsNo: topic.followUpQuestionsNo,
        isActive: topic.isActive,
      })
      .onConflictDoUpdate({
        target: examTopics.slug,
        set: {
          themeId,
          titleNo: topic.titleNo,
          level: topic.level,
          monologuePromptNo: topic.monologuePromptNo,
          discussionPromptNo: topic.discussionPromptNo,
          followUpQuestionsNo: topic.followUpQuestionsNo,
          isActive: topic.isActive,
        },
      });
    console.log(`✓ Seeded topic: [${topic.level}] ${topic.titleNo} (${topic.slug})`);
  }

  // 3. Seed test user quota row (30 minutes = 1800 seconds default quota)
  await db
    .insert(userQuotas)
    .values({
      userId: TEST_USER_ID,
      remainingAudioSeconds: 1800,
      totalLlmTokensUsed: 0,
      totalTtsCharactersUsed: 0,
      totalSttSecondsUsed: '0',
      totalCostUsd: '0',
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userQuotas.userId,
      set: {
        updatedAt: new Date(),
      },
    });
  console.log(`✓ Seeded user quota: ${TEST_USER_ID} with 1800 remaining audio seconds`);

  // 4. Seed tier configurations (FREE, STANDARD, PREMIUM) from fallback defaults
  for (const tierKey of ['FREE', 'STANDARD', 'PREMIUM'] as const) {
    const config = DEFAULT_TIER_CONFIGS[tierKey];
    await db
      .insert(tierConfigs)
      .values({
        tier: config.tier,
        dailyTestLimit: config.dailyTestLimit,
        priceCents: config.priceCents,
        currency: config.currency,
        featuresJson: config.features,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: tierConfigs.tier,
        set: {
          dailyTestLimit: config.dailyTestLimit,
          priceCents: config.priceCents,
          currency: config.currency,
          featuresJson: config.features,
          updatedAt: new Date(),
        },
      });
    console.log(`✓ Seeded tier config: ${config.tier} (${config.dailyTestLimit} tests/day, ${config.priceCents / 100} ${config.currency})`);
  }

  // 5. Seed system configurations (referral bonus and duration) from fallback defaults
  await db
    .insert(systemConfigs)
    .values({
      key: 'REFERRAL_BONUS_DAILY_TESTS',
      value: DEFAULT_REFERRAL_CONFIG.bonusDailyTests.toString(),
      description: 'Antall ekstra tester per dag gitt for hver vervet venn',
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemConfigs.key,
      set: {
        value: DEFAULT_REFERRAL_CONFIG.bonusDailyTests.toString(),
        updatedAt: new Date(),
      },
    });

  await db
    .insert(systemConfigs)
    .values({
      key: 'REFERRAL_BONUS_DURATION_DAYS',
      value: DEFAULT_REFERRAL_CONFIG.durationDays.toString(),
      description: 'Antall dager vervebonusen er aktiv',
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemConfigs.key,
      set: {
        value: DEFAULT_REFERRAL_CONFIG.durationDays.toString(),
        updatedAt: new Date(),
      },
    });
  console.log(`✓ Seeded system configs: REFERRAL_BONUS_DAILY_TESTS=${DEFAULT_REFERRAL_CONFIG.bonusDailyTests}, REFERRAL_BONUS_DURATION_DAYS=${DEFAULT_REFERRAL_CONFIG.durationDays}`);

  console.log('--- Database seed completed successfully ---');
}

import { fileURLToPath } from 'node:url';

const isDirectRun =
  (typeof import.meta.url === 'string' && process.argv[1] === fileURLToPath(import.meta.url)) ||
  process.argv[1]?.endsWith('seed.ts');

if (isDirectRun) {
  seed()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('Error during database seed:', error);
      await pool.end();
      process.exit(1);
    });
}
