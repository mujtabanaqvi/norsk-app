import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { examTopics, examSessions } from '@/src/db/schema';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { slugifyNorwegianTitle } from '@/src/server/exam-randomizer';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const updateExamSchema = z.object({
  titleNo: z.string().trim().min(3, 'Tittel må være minst 3 tegn.').optional(),
  slug: z.string().trim().min(2).optional(),
  level: z.enum(['B1', 'B2']).optional(),
  monologuePromptNo: z
    .string()
    .trim()
    .min(10, 'Del 1 monologoppgave må være minst 10 tegn.')
    .optional(),
  discussionPromptNo: z
    .string()
    .trim()
    .min(10, 'Del 2 samtaleoppgave må være minst 10 tegn.')
    .optional(),
  followUpQuestionsNo: z
    .array(z.string().trim().min(5, 'Hvert oppfølgingsspørsmål må være minst 5 tegn.'))
    .min(1, 'Minst ett oppfølgingsspørsmål kreves.')
    .optional(),
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
      return NextResponse.json({ error: 'Ugyldig eksamen-ID' }, { status: 400 });
    }

    let rawJson: unknown;
    try {
      rawJson = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const parsed = updateExamSchema.safeParse(rawJson);
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
    if (parsed.data.level !== undefined) updates.level = parsed.data.level;
    if (parsed.data.monologuePromptNo !== undefined) {
      updates.monologuePromptNo = parsed.data.monologuePromptNo;
    }
    if (parsed.data.discussionPromptNo !== undefined) {
      updates.discussionPromptNo = parsed.data.discussionPromptNo;
    }
    if (parsed.data.followUpQuestionsNo !== undefined) {
      updates.followUpQuestionsNo = parsed.data.followUpQuestionsNo;
    }
    if (parsed.data.isActive !== undefined) {
      updates.isActive = parsed.data.isActive;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'Ingen felter ble sendt for oppdatering.' },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(examTopics)
      .set(updates)
      .where(eq(examTopics.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Eksamen ikke funnet' }, { status: 404 });
    }

    return NextResponse.json({ exam: updated }, { status: 200 });
  } catch (error) {
    console.error('[PATCH /api/admin/exams/[id]] Error:', error);
    return NextResponse.json(
      {
        error: 'Kunne ikke oppdatere eksamen',
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
      return NextResponse.json({ error: 'Ugyldig eksamen-ID' }, { status: 400 });
    }

    // Unlink any historical examSessions referencing this topicId so FK doesn't block deletion
    await db
      .update(examSessions)
      .set({ topicId: null })
      .where(eq(examSessions.topicId, id));

    const [deleted] = await db
      .delete(examTopics)
      .where(eq(examTopics.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: 'Eksamen ikke funnet' }, { status: 404 });
    }

    return NextResponse.json({ deletedId: deleted.id }, { status: 200 });
  } catch (error) {
    console.error('[DELETE /api/admin/exams/[id]] Error:', error);
    return NextResponse.json(
      {
        error: 'Kunne ikke slette eksamen',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

