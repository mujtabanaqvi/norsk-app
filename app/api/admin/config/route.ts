import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/src/db';
import { tierConfigs, systemConfigs } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { getTierConfigs, getReferralSettings } from '@/lib/tier-policy';

const updateTierSchema = z.object({
  tier: z.enum(['FREE', 'STANDARD', 'PREMIUM']),
  dailyTestLimit: z.number().int().min(1, 'Grense må være minst 1'),
  priceCents: z.number().int().min(0, 'Pris kan ikke være negativ'),
  currency: z.string().default('NOK'),
  features: z.array(z.string()).optional(),
});

const updateReferralSchema = z.object({
  bonusDailyTests: z.number().int().min(1, 'Bonus må være minst 1'),
  durationDays: z.number().int().min(1, 'Varighet må være minst 1 dag'),
});

export async function GET(req: NextRequest) {
  const auth = verifyAdminRequest(req);
  if (!auth.authorized) {
    return auth.errorResponse!;
  }

  try {
    const [tiers, referral] = await Promise.all([
      getTierConfigs(),
      getReferralSettings(),
    ]);

    return NextResponse.json({
      tiers,
      referral,
    });
  } catch (error) {
    console.error('Error fetching admin configs:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = verifyAdminRequest(req);
  if (!auth.authorized) {
    return auth.errorResponse!;
  }

  try {
    const body = await req.json().catch(() => ({}));

    // If updating a tier
    if (body.tier) {
      const parsed = updateTierSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Validation Error', details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const { tier, dailyTestLimit, priceCents, currency, features } = parsed.data;

      await db
        .insert(tierConfigs)
        .values({
          tier,
          dailyTestLimit,
          priceCents,
          currency,
          featuresJson: features || [],
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: tierConfigs.tier,
          set: {
            dailyTestLimit,
            priceCents,
            currency,
            featuresJson: features || [],
            updatedAt: new Date(),
          },
        });

      return NextResponse.json({ success: true, message: `Tier ${tier} oppdatert!` });
    }

    // If updating referral settings
    if (body.bonusDailyTests !== undefined || body.durationDays !== undefined) {
      const parsed = updateReferralSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Validation Error', details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const { bonusDailyTests, durationDays } = parsed.data;

      await db
        .insert(systemConfigs)
        .values({
          key: 'REFERRAL_BONUS_DAILY_TESTS',
          value: bonusDailyTests.toString(),
          description: 'Antall ekstra tester per dag gitt for hver vervet venn',
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: systemConfigs.key,
          set: {
            value: bonusDailyTests.toString(),
            updatedAt: new Date(),
          },
        });

      await db
        .insert(systemConfigs)
        .values({
          key: 'REFERRAL_BONUS_DURATION_DAYS',
          value: durationDays.toString(),
          description: 'Antall dager vervebonusen er aktiv',
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: systemConfigs.key,
          set: {
            value: durationDays.toString(),
            updatedAt: new Date(),
          },
        });

      return NextResponse.json({ success: true, message: 'Verveinnstillinger oppdatert!' });
    }

    return NextResponse.json({ error: 'Ugyldig oppdateringsforespørsel' }, { status: 400 });
  } catch (error) {
    console.error('Error updating admin configs:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

