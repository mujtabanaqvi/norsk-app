import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { examThemes } from '@/src/db/schema';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { slugifyNorwegianTitle } from '@/src/server/exam-randomizer';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const updateThemeSchema = z.object({
  titleNo: z.string().trim().min(2, 'Tittel må være minst 2 tegn.').optional(),
  slug: z.string().trim().min(2).optional(),
  descriptionNo: z.string().trim().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = verifyAdminRequest(req);
  if (!auth.authorized) {
    return auth.errorResponse!;
  }

  try {
    const { id } = await params;
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Ugyldig tema-ID' }, { status: 400 });
    }

    let rawJson: unknown;
    try {
      rawJson = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const parsed = updateThemeSchema.safeParse(rawJson);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validering feilet',
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.titleNo !== undefined) updates.titleNo = parsed.data.titleNo;
    if (parsed.data.slug !== undefined) {
      updates.slug = slugifyNorwegianTitle(parsed.data.slug);
    }
    if (parsed.data.descriptionNo !== undefined) {
      updates.descriptionNo = parsed.data.descriptionNo || null;
    }
    if (parsed.data.sortOrder !== undefined) updates.sortOrder = parsed.data.sortOrder;
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'Ingen felter ble sendt for oppdatering.' },
        { status: 400 }
      );
    }
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(examThemes)
      .set(updates)
      .where(eq(examThemes.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Tema ikke funnet' }, { status: 404 });
    }

    return NextResponse.json({ theme: updated }, { status: 200 });
  } catch (error) {
    console.error('[PATCH /api/admin/themes/[id]] Error:', error);
    return NextResponse.json(
      {
        error: 'Kunne ikke oppdatere tema',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = verifyAdminRequest(req);
  if (!auth.authorized) {
    return auth.errorResponse!;
  }

  try {
    const { id } = await params;
    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Ugyldig tema-ID' }, { status: 400 });
    }

    // Question sets and sessions referencing this theme are unlinked by ON DELETE SET NULL
    const [deleted] = await db
      .delete(examThemes)
      .where(eq(examThemes.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: 'Tema ikke funnet' }, { status: 404 });
    }

    return NextResponse.json({ deletedId: deleted.id }, { status: 200 });
  } catch (error) {
    console.error('[DELETE /api/admin/themes/[id]] Error:', error);
    return NextResponse.json(
      {
        error: 'Kunne ikke slette tema',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
