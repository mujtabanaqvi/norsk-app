import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { db, pool } from './index';
import { examTopics, userQuotas } from './schema';
import { sql } from 'drizzle-orm';

export const SAMPLE_TOPICS = [
  {
    slug: 'miljo-og-baerekraft-i-hverdagen',
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

  // 1. Seed realistic Norskprøven muntlig topics (2 B1, 2 B2)
  for (const topic of SAMPLE_TOPICS) {
    await db
      .insert(examTopics)
      .values({
        slug: topic.slug,
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

  // 2. Seed test user quota row (30 minutes = 1800 seconds default quota)
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
