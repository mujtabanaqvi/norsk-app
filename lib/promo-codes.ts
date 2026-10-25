import { randomInt } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db';
import { promoCodes, promoRedemptions, subscriptions, type PromoCode } from '@/src/db/schema';
import { recomputeUserTier, type Tier } from '@/lib/entitlements';

/**
 * Promo codes grant a paid tier for a number of months without going through a store, so no card
 * is needed. A redemption becomes a `subscriptions` row with provider PROMO, and the usual
 * `recomputeUserTier()` picks it up next to any RevenueCat subscription.
 *
 * Only 100%-off codes are redeemable: a partial discount has to be charged by the store
 * (App Store / Play / RevenueCat Web Billing), which this server cannot do.
 */

const TIER_RANK: Record<Tier, number> = { FREE: 0, STANDARD: 1, PREMIUM: 2 };
const PROMO_CODE_PATTERN = /^[A-Z0-9-]{4,32}$/;
// No 0/O, 1/I/L, so codes survive being read aloud or typed from a screenshot
const GENERATED_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export type PromoErrorCode =
  | 'INVALID_CODE'
  | 'NOT_FOUND'
  | 'INACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'EXHAUSTED'
  | 'ALREADY_REDEEMED'
  | 'ALREADY_HAS_TIER'
  | 'UNSUPPORTED_DISCOUNT';

export class PromoCodeError extends Error {
  constructor(public readonly code: PromoErrorCode, message: string = code) {
    super(message);
    this.name = 'PromoCodeError';
  }
}

/** Uppercased, trimmed code, or null when it can't be a promo code at all. */
export function normalizePromoCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return PROMO_CODE_PATTERN.test(code) ? code : null;
}

export function generatePromoCode(length = 8): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += GENERATED_CODE_ALPHABET[randomInt(GENERATED_CODE_ALPHABET.length)];
  }
  return code;
}

/** Calendar months in UTC; Jan 31 + 1 month lands on the last day of February. */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDayOfMonth = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDayOfMonth));
  return result;
}

type PromoCodeRules = Pick<
  PromoCode,
  'tier' | 'discountPercent' | 'maxRedemptions' | 'redemptionCount' | 'validFrom' | 'expiresAt' | 'isActive'
>;

/** Why this user can't redeem this code right now, or null when they can. */
export function checkPromoEligibility(
  promo: PromoCodeRules | undefined,
  context: { effectiveTier: Tier; alreadyRedeemed: boolean },
  now: Date = new Date()
): PromoErrorCode | null {
  if (!promo) return 'NOT_FOUND';
  if (!promo.isActive) return 'INACTIVE';
  if (promo.validFrom && promo.validFrom.getTime() > now.getTime()) return 'NOT_STARTED';
  if (promo.expiresAt && promo.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  if (promo.discountPercent < 100) return 'UNSUPPORTED_DISCOUNT';
  if (context.alreadyRedeemed) return 'ALREADY_REDEEMED';
  if (promo.maxRedemptions !== null && promo.redemptionCount >= promo.maxRedemptions) return 'EXHAUSTED';
  // Upgrades (paid Standard + Premium code) are fine; a code that adds nothing is refused so it isn't wasted
  if (TIER_RANK[context.effectiveTier] >= TIER_RANK[promo.tier]) return 'ALREADY_HAS_TIER';
  return null;
}

export function promoExternalId(promoCodeId: string, userId: string): string {
  return `promo:${promoCodeId}:${userId}`;
}

/** Admin form date field: empty string / null clears it, anything else must parse. */
export const optionalDateSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    if (value === null || value.trim() === '') return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ugyldig dato.' });
      return z.NEVER;
    }
    return date;
  });

export function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } })?.cause;
  return (error as { code?: string })?.code === '23505' || cause?.code === '23505';
}

export interface PromoRedemptionResult {
  tier: Tier;
  grantedTier: 'STANDARD' | 'PREMIUM';
  expiresAt: Date;
}

export async function redeemPromoCode(userId: string, rawCode: string): Promise<PromoRedemptionResult> {
  const code = normalizePromoCode(rawCode);
  if (!code) throw new PromoCodeError('INVALID_CODE');

  const effectiveTier = await recomputeUserTier(userId);
  const now = new Date();

  let granted: { grantedTier: 'STANDARD' | 'PREMIUM'; expiresAt: Date };
  try {
    granted = await db.transaction(async (tx) => {
      // Row lock serialises concurrent redemptions, so the max-redemptions check below can't oversell
      const [promo] = await tx.select().from(promoCodes).where(eq(promoCodes.code, code)).limit(1).for('update');
      const [existing] = promo
        ? await tx
            .select({ id: promoRedemptions.id })
            .from(promoRedemptions)
            .where(and(eq(promoRedemptions.promoCodeId, promo.id), eq(promoRedemptions.userId, userId)))
            .limit(1)
        : [];

      const error = checkPromoEligibility(promo, { effectiveTier, alreadyRedeemed: Boolean(existing) }, now);
      if (error) throw new PromoCodeError(error);
      if (promo.tier === 'FREE') throw new PromoCodeError('NOT_FOUND');

      const expiresAt = addMonths(now, promo.durationMonths);
      const values = {
        userId,
        provider: 'PROMO' as const,
        externalId: promoExternalId(promo.id, userId),
        productId: `promo:${promo.code}`,
        environment: 'production',
        tier: promo.tier,
        status: 'ACTIVE' as const,
        currentPeriodStart: now,
        currentPeriodEnd: expiresAt,
        cancelAtPeriodEnd: true,
      };
      const [subscription] = await tx
        .insert(subscriptions)
        .values(values)
        .onConflictDoUpdate({
          target: [subscriptions.provider, subscriptions.externalId],
          set: { ...values, updatedAt: now },
        })
        .returning({ id: subscriptions.id });

      await tx.insert(promoRedemptions).values({
        promoCodeId: promo.id,
        userId,
        subscriptionId: subscription.id,
        redeemedAt: now,
      });
      await tx
        .update(promoCodes)
        .set({ redemptionCount: sql`${promoCodes.redemptionCount} + 1`, updatedAt: now })
        .where(eq(promoCodes.id, promo.id));

      return { grantedTier: promo.tier, expiresAt };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new PromoCodeError('ALREADY_REDEEMED');
    throw error;
  }

  const tier = await recomputeUserTier(userId);
  return { tier, ...granted };
}
