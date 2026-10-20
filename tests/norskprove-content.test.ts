import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NORSKPROVE_THEMES } from '../src/db/content/norskprove-themes';
import { SAMPLE_THEMES, SAMPLE_TOPICS } from '../src/db/seed';
import { createExamSchema } from '../app/api/admin/exams/route';
import { createThemeSchema } from '../app/api/admin/themes/route';
import { slugifyNorwegianTitle } from '../src/server/exam-randomizer';

const allSets = NORSKPROVE_THEMES.flatMap((theme) =>
  theme.sets.map((set) => ({ ...set, themeSlug: theme.slug }))
);

describe('Norskprøven seed content', () => {
  it('has unique, URL-safe theme and question set slugs', () => {
    const themeSlugs = NORSKPROVE_THEMES.map((t) => t.slug);
    assert.equal(new Set(themeSlugs).size, themeSlugs.length, 'theme slugs are unique');

    const setSlugs = allSets.map((s) => s.slug);
    assert.equal(new Set(setSlugs).size, setSlugs.length, 'set slugs are unique');

    for (const slug of [...themeSlugs, ...setSlugs]) {
      assert.equal(slugifyNorwegianTitle(slug), slug, `"${slug}" is already a normalized slug`);
    }

    // Question set slugs must not collide with the demo sets in src/db/seed.ts
    const sampleSetSlugs = new Set(SAMPLE_TOPICS.map((t) => t.slug));
    for (const slug of setSlugs) {
      assert.ok(!sampleSetSlugs.has(slug), `"${slug}" collides with a demo seed set`);
    }
  });

  it('reuses demo theme slugs with the same titles so the two seeds do not duplicate themes', () => {
    const contentBySlug = new Map(NORSKPROVE_THEMES.map((t) => [t.slug, t]));
    for (const sample of SAMPLE_THEMES) {
      const content = contentBySlug.get(sample.slug);
      assert.ok(content, `demo theme ${sample.slug} exists in the content seed`);
      assert.equal(content.titleNo, sample.titleNo);
    }
  });

  it('passes the same validation as the admin API', () => {
    for (const theme of NORSKPROVE_THEMES) {
      const parsed = createThemeSchema.safeParse({
        titleNo: theme.titleNo,
        slug: theme.slug,
        descriptionNo: theme.descriptionNo,
        sortOrder: theme.sortOrder,
      });
      assert.equal(parsed.success, true, `theme ${theme.slug} is valid`);
    }
    for (const set of allSets) {
      const parsed = createExamSchema.safeParse(set);
      assert.equal(
        parsed.success,
        true,
        `set ${set.slug} is valid: ${parsed.success ? '' : JSON.stringify(parsed.error.flatten().fieldErrors)}`
      );
    }
  });

  it('gives every theme sets on both levels, with enough distinct follow-up questions', () => {
    for (const theme of NORSKPROVE_THEMES) {
      for (const level of ['B1', 'B2'] as const) {
        const sets = theme.sets.filter((s) => s.level === level);
        assert.ok(sets.length >= 1, `${theme.slug} has a ${level} set`);
        const pooled = sets.flatMap((s) => s.followUpQuestionsNo);
        assert.equal(new Set(pooled).size, pooled.length, `${theme.slug} ${level} follow-ups are unique`);
        assert.ok(pooled.length >= 3, `${theme.slug} ${level} pool has at least 3 follow-ups`);
      }
    }
    for (const set of allSets) {
      for (const q of set.followUpQuestionsNo) {
        assert.ok(/[?.]$/.test(q), `follow-up "${q}" ends with punctuation`);
      }
    }
  });

  it('covers enough themes per level for random exams to mix themes', () => {
    for (const level of ['B1', 'B2'] as const) {
      const themes = new Set(allSets.filter((s) => s.level === level).map((s) => s.themeSlug));
      assert.ok(themes.size >= 3, `${level} spans at least 3 themes`);
    }
  });
});
