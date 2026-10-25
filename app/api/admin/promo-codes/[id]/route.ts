import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { promoCodes } from '@/src/db/schema';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { optionalDateSchema } from '@/lib/promo-codes';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tier and duration stay fixed once created, so every redemption of a code means the same thing
export const updatePromoCodeSchema = z.object({
  isActive: z.boolean().optional(),
  maxRedemptions: z.number().int().min(1, 'Minst 1.').nullable().optional(),
  validFrom: optionalDateSchema,
  expiresAt: optionalDateSchema,
  note: z.string().trim().max(500).nullable().optional(),
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
      return NextResponse.json({ error: 'Ugyldig kode-ID' }, { status: 400 });
    }

    let rawJson: unknown;
    try {
      rawJson = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const parsed = updatePromoCodeSchema.safeParse(rawJson);
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
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
    if (parsed.data.maxRedemptions !== undefined) updates.maxRedemptions = parsed.data.maxRedemptions;
    if (parsed.data.validFrom !== undefined) updates.validFrom = parsed.data.validFrom;
    if (parsed.data.expiresAt !== undefined) updates.expiresAt = parsed.data.expiresAt;
    if (parsed.data.note !== undefined) updates.note = parsed.data.note || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'Ingen felter ble sendt for oppdatering.' },
        { status: 400 }
      );
    }
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(promoCodes)
      .set(updates)
      .where(eq(promoCodes.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Kampanjekode ikke funnet' }, { status: 404 });
    }

    return NextResponse.json({ promoCode: updated }, { status: 200 });
  } catch (error) {
    console.error('[PATCH /api/admin/promo-codes/[id]] Error:', error);
    return NextResponse.json(
      {
        error: 'Kunne ikke oppdatere kampanjekode',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/** Only unused codes can be deleted; a redeemed one keeps its history and should be deactivated. */
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
      return NextResponse.json({ error: 'Ugyldig kode-ID' }, { status: 400 });
    }

    const [promo] = await db
      .select({ redemptionCount: promoCodes.redemptionCount })
      .from(promoCodes)
      .where(eq(promoCodes.id, id))
      .limit(1);
    if (!promo) {
      return NextResponse.json({ error: 'Kampanjekode ikke funnet' }, { status: 404 });
    }
    if (promo.redemptionCount > 0) {
      return NextResponse.json(
        { error: 'Koden er allerede brukt og kan ikke slettes. Deaktiver den i stedet.' },
        { status: 409 }
      );
    }

    await db.delete(promoCodes).where(eq(promoCodes.id, id));
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('[DELETE /api/admin/promo-codes/[id]] Error:', error);
    return NextResponse.json(
      {
        error: 'Kunne ikke slette kampanjekode',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
