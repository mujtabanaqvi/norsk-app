import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { eq, inArray } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { db, pool } from './index';
import { examThemes, examTopics } from './schema';
import { NORSKPROVE_THEMES } from './content/norskprove-themes';

/**
 * Seeds curated Norskprøven themes and question sets (src/db/content/norskprove-themes.ts).
 *
 * Safe for production by default: only inserts themes/sets whose slug does not exist yet,
 * and never touches rows created by admins.
 *
 *   npm run db:seed:norskprove                # insert missing themes and question sets
 *   npm run db:seed:norskprove -- --dry-run   # show what would change, write nothing
 *   npm run db:seed:norskprove -- --update    # also overwrite existing rows with these slugs
 */
export interface SeedNorskproveOptions {
  dryRun?: boolean;
  update?: boolean;
}

export interface SeedNorskproveSummary {
  themesCreated: number;
  themesUpdated: number;
  themesUnchanged: number;
  setsCreated: number;
  setsUpdated: number;
  setsUnchanged: number;
}

function describeTarget(): string {
  const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return 'localhost (default connection string)';
  }
}

export async function seedNorskproveContent(
  options: SeedNorskproveOptions = {}
): Promise<SeedNorskproveSummary> {
  const { dryRun = false, update = false } = options;
  const themeSlugs = NORSKPROVE_THEMES.map((t) => t.slug);
  const setSlugs = NORSKPROVE_THEMES.flatMap((t) => t.sets.map((s) => s.slug));

  const existingThemes = await db
    .select({ id: examThemes.id, slug: examThemes.slug })
    .from(examThemes)
    .where(inArray(examThemes.slug, themeSlugs));
  const existingSetSlugs = new Set(
    (
      await db
        .select({ slug: examTopics.slug })
        .from(examTopics)
        .where(inArray(examTopics.slug, setSlugs))
    ).map((row) => row.slug)
  );
  const existingThemeIdBySlug = new Map(existingThemes.map((t) => [t.slug, t.id]));

  const summary: SeedNorskproveSummary = {
    themesCreated: 0,
    themesUpdated: 0,
    themesUnchanged: 0,
    setsCreated: 0,
    setsUpdated: 0,
    setsUnchanged: 0,
  };

  console.log(
    `--- Norskprøven content seed → ${describeTarget()}${dryRun ? ' (DRY RUN)' : ''}${update ? ' (UPDATE)' : ''} ---`
  );

  const apply = async (tx: Pick<typeof db, 'insert' | 'update'>) => {
    for (const theme of NORSKPROVE_THEMES) {
      let themeId = existingThemeIdBySlug.get(theme.slug);

      if (!themeId) {
        summary.themesCreated += 1;
        console.log(`+ theme  ${theme.titleNo} (${theme.slug})`);
        if (!dryRun) {
          const [created] = await tx
            .insert(examThemes)
            .values({
              slug: theme.slug,
              titleNo: theme.titleNo,
              descriptionNo: theme.descriptionNo,
              sortOrder: theme.sortOrder,
              isActive: true,
            })
            .returning({ id: examThemes.id });
          themeId = created.id;
        }
      } else if (update) {
        summary.themesUpdated += 1;
        console.log(`~ theme  ${theme.titleNo} (${theme.slug})`);
        if (!dryRun) {
          await tx
            .update(examThemes)
            .set({
              titleNo: theme.titleNo,
              descriptionNo: theme.descriptionNo,
              sortOrder: theme.sortOrder,
              updatedAt: new Date(),
            })
            .where(eq(examThemes.slug, theme.slug));
        }
      } else {
        summary.themesUnchanged += 1;
      }

      for (const set of theme.sets) {
        const content = {
          themeId: themeId ?? null,
          titleNo: set.titleNo,
          level: set.level,
          monologuePromptNo: set.monologuePromptNo,
          discussionPromptNo: set.discussionPromptNo,
          followUpQuestionsNo: set.followUpQuestionsNo,
        };

        if (!existingSetSlugs.has(set.slug)) {
          summary.setsCreated += 1;
          console.log(`  + [${set.level}] ${set.titleNo} (${set.slug})`);
          if (!dryRun) {
            await tx.insert(examTopics).values({ slug: set.slug, isActive: true, ...content });
          }
        } else if (update) {
          summary.setsUpdated += 1;
          console.log(`  ~ [${set.level}] ${set.titleNo} (${set.slug})`);
          if (!dryRun) {
            await tx
              .update(examTopics)
              .set(content)
              .where(eq(examTopics.slug, set.slug));
          }
        } else {
          summary.setsUnchanged += 1;
        }
      }
    }
  };

  if (dryRun) {
    await apply(db);
  } else {
    await db.transaction(async (tx) => apply(tx));
  }

  console.log(
    `--- Themes: ${summary.themesCreated} created, ${summary.themesUpdated} updated, ${summary.themesUnchanged} unchanged. ` +
      `Question sets: ${summary.setsCreated} created, ${summary.setsUpdated} updated, ${summary.setsUnchanged} unchanged. ---`
  );
  if (!update && (summary.themesUnchanged > 0 || summary.setsUnchanged > 0)) {
    console.log('Existing rows were left untouched. Re-run with --update to overwrite them.');
  }
  return summary;
}

const isDirectRun =
  (typeof import.meta.url === 'string' && process.argv[1] === fileURLToPath(import.meta.url)) ||
  process.argv[1]?.endsWith('seed-norskprove.ts');

if (isDirectRun) {
  const args = new Set(process.argv.slice(2));
  seedNorskproveContent({ dryRun: args.has('--dry-run'), update: args.has('--update') })
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('Error during Norskprøven content seed:', error);
      await pool.end();
      process.exit(1);
    });
}
