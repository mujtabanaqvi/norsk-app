import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { examThemes, examTopics } from '@/src/db/schema';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { slugifyNorwegianTitle } from '@/src/server/exam-randomizer';

export const createThemeSchema = z.object({
  titleNo: z.string().trim().min(2, 'Tittel må være minst 2 tegn.'),
  slug: z.string().trim().optional(),
  descriptionNo: z.string().trim().nullable().optional(),
  sortOrder: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export async function GET(req: NextRequest) {
  const auth = verifyAdminRequest(req);
  if (!auth.authorized) {
    return auth.errorResponse!;
  }

  try {
    const themes = await db
      .select()
      .from(examThemes)
      .orderBy(asc(examThemes.sortOrder), asc(examThemes.titleNo));

    const setCounts = await db
      .select({
        themeId: examTopics.themeId,
        level: examTopics.level,
        count: sql<number>`count(*)::int`,
      })
      .from(examTopics)
      .groupBy(examTopics.themeId, examTopics.level);

    const countsByThemeId = new Map<string, { B1: number; B2: number }>();
    for (const row of setCounts) {
      if (!row.themeId) continue;
      const counts = countsByThemeId.get(row.themeId) ?? { B1: 0, B2: 0 };
      counts[row.level] = Number(row.count) || 0;
      countsByThemeId.set(row.themeId, counts);
    }

    const enrichedThemes = themes.map((theme) => ({
      ...theme,
      setCounts: countsByThemeId.get(theme.id) ?? { B1: 0, B2: 0 },
    }));

    return NextResponse.json({ themes: enrichedThemes }, { status: 200 });
  } catch (error) {
    console.error('[GET /api/admin/themes] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = verifyAdminRequest(req);
  if (!auth.authorized) {
    return auth.errorResponse!;
  }

  try {
    let rawJson: unknown;
    try {
      rawJson = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const parsed = createThemeSchema.safeParse(rawJson);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validering feilet',
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { titleNo, slug: rawSlug, descriptionNo, sortOrder, isActive } = parsed.data;

    let baseSlug = slugifyNorwegianTitle(rawSlug && rawSlug.length > 0 ? rawSlug : titleNo);

    // Ensure slug uniqueness
    const existingWithSlug = await db
      .select({ id: examThemes.id })
      .from(examThemes)
      .where(eq(examThemes.slug, baseSlug))
      .limit(1);

    if (existingWithSlug.length > 0) {
      baseSlug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const [created] = await db
      .insert(examThemes)
      .values({
        titleNo,
        slug: baseSlug,
        descriptionNo: descriptionNo || null,
        sortOrder: sortOrder ?? 0,
        isActive: isActive ?? true,
      })
      .returning();

    return NextResponse.json(
      { theme: { ...created, setCounts: { B1: 0, B2: 0 } } },
      { status: 201 }
    );
  } catch (error) {
    console.error('[POST /api/admin/themes] Error:', error);
    return NextResponse.json(
      {
        error: 'Kunne ikke opprette tema',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
