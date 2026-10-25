import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { desc } from 'drizzle-orm';
import { db } from '@/src/db';
import { promoCodes } from '@/src/db/schema';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { generatePromoCode, isUniqueViolation, normalizePromoCode, optionalDateSchema } from '@/lib/promo-codes';

export const createPromoCodeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .optional()
      .transform((value, ctx) => {
        if (!value) return undefined;
        const code = normalizePromoCode(value);
        if (!code) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Koden må være 4–32 tegn: A–Z, 0–9 eller bindestrek.' });
          return z.NEVER;
        }
        return code;
      }),
    tier: z.enum(['STANDARD', 'PREMIUM']),
    // Partial discounts need a store-side offer, so only 100 % is accepted for now
    discountPercent: z
      .literal(100, { errorMap: () => ({ message: 'Kun 100 % rabatt støttes foreløpig.' }) })
      .optional()
      .default(100),
    durationMonths: z.number().int().min(1, 'Minst 1 måned.').max(24, 'Maks 24 måneder.'),
    maxRedemptions: z.number().int().min(1, 'Minst 1.').nullable().optional(),
    validFrom: optionalDateSchema,
    expiresAt: optionalDateSchema,
    isActive: z.boolean().optional().default(true),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((data) => !data.validFrom || !data.expiresAt || data.validFrom < data.expiresAt, {
    message: 'Utløpsdato må være etter startdato.',
    path: ['expiresAt'],
  });

export async function GET(req: NextRequest) {
  const auth = verifyAdminRequest(req);
  if (!auth.authorized) {
    return auth.errorResponse!;
  }

  try {
    const codes = await db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt));
    return NextResponse.json({ promoCodes: codes }, { status: 200 });
  } catch (error) {
    console.error('[GET /api/admin/promo-codes] Error:', error);
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

    const parsed = createPromoCodeSchema.safeParse(rawJson);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validering feilet',
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { code, ...rest } = parsed.data;
    const [created] = await db
      .insert(promoCodes)
      .values({
        ...rest,
        code: code ?? generatePromoCode(),
        maxRedemptions: rest.maxRedemptions ?? null,
        validFrom: rest.validFrom ?? null,
        expiresAt: rest.expiresAt ?? null,
        note: rest.note || null,
      })
      .returning();

    return NextResponse.json({ promoCode: created }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: 'Koden finnes allerede.' }, { status: 409 });
    }
    console.error('[POST /api/admin/promo-codes] Error:', error);
    return NextResponse.json(
      {
        error: 'Kunne ikke opprette kampanjekode',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
