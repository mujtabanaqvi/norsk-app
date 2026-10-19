import { db } from '@/src/db';
import { tierConfigs, systemConfigs, referralRewards, examSessions, users } from '@/src/db/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

export interface TierPolicy {
  tier: 'FREE' | 'STANDARD' | 'PREMIUM';
  dailyTestLimit: number;
  priceCents: number;
  currency: string;
  features: string[];
}

// Fallback defaults if database has not yet been seeded
export const DEFAULT_TIER_CONFIGS: Record<'FREE' | 'STANDARD' | 'PREMIUM', TierPolicy> = {
  FREE: {
    tier: 'FREE',
    dailyTestLimit: 1, // Default free users: 1 test per 24 hours (calendar day)
    priceCents: 0,
    currency: 'NOK',
    features: ['1 test per dag', 'B1 og B2 temaer', 'Full AI evaluering'],
  },
  STANDARD: {
    tier: 'STANDARD',
    dailyTestLimit: 5,
    priceCents: 14900, // 149 NOK / mnd
    currency: 'NOK',
    features: ['5 tester per dag', 'B1 og B2 temaer', 'Prioritert AI stemme', 'Detaljert tilbakemelding'],
  },
  PREMIUM: {
    tier: 'PREMIUM',
    dailyTestLimit: 20, // Or practically unlimited daily practice
    priceCents: 29900, // 299 NOK / mnd
    currency: 'NOK',
    features: ['Ubegrenset/20 tester per dag', 'Alt i Standard', 'Full historikk og uttaleanalyse', '24/7 tilgang'],
  },
};

export const DEFAULT_REFERRAL_CONFIG = {
  bonusDailyTests: 2, // +2 extra tests per day
  durationDays: 7, // for 7 days
};

/**
 * Get tier configuration for all tiers or a specific tier
 */
export async function getTierConfigs(): Promise<Record<'FREE' | 'STANDARD' | 'PREMIUM', TierPolicy>> {
  try {
    const rows = await db.select().from(tierConfigs);
    if (!rows || rows.length === 0) {
      return DEFAULT_TIER_CONFIGS;
    }

    const configs = { ...DEFAULT_TIER_CONFIGS };
    for (const row of rows) {
      configs[row.tier] = {
        tier: row.tier,
        dailyTestLimit: row.dailyTestLimit,
        priceCents: row.priceCents,
        currency: row.currency,
        features: row.featuresJson || DEFAULT_TIER_CONFIGS[row.tier]?.features || [],
      };
    }
    return configs;
  } catch {
    return DEFAULT_TIER_CONFIGS;
  }
}

/**
 * Get referral system settings (bonus tests per day, duration in days)
 */
export async function getReferralSettings(): Promise<{ bonusDailyTests: number; durationDays: number }> {
  try {
    const rows = await db.select().from(systemConfigs);
    const bonusRow = rows.find((r) => r.key === 'REFERRAL_BONUS_DAILY_TESTS');
    const durationRow = rows.find((r) => r.key === 'REFERRAL_BONUS_DURATION_DAYS');

    return {
      bonusDailyTests: bonusRow ? parseInt(bonusRow.value, 10) : DEFAULT_REFERRAL_CONFIG.bonusDailyTests,
      durationDays: durationRow ? parseInt(durationRow.value, 10) : DEFAULT_REFERRAL_CONFIG.durationDays,
    };
  } catch {
    return DEFAULT_REFERRAL_CONFIG;
  }
}

/**
 * Calculate the user's active referral bonus tests per day for today
 */
export async function getActiveReferralBonusTests(userId: string): Promise<{ bonusTests: number; activeRewardsCount: number }> {
  try {
    const now = new Date();
    const activeRewards = await db
      .select()
      .from(referralRewards)
      .where(
        and(
          eq(referralRewards.referrerUserId, userId),
          lte(referralRewards.startsAt, now),
          gte(referralRewards.expiresAt, now)
        )
      );

    const bonusTests = activeRewards.reduce((sum, r) => sum + r.bonusTestsPerDay, 0);
    return { bonusTests, activeRewardsCount: activeRewards.length };
  } catch {
    return { bonusTests: 0, activeRewardsCount: 0 };
  }
}

/**
 * Get start of calendar day (00:00:00) in Europe/Oslo timezone
 */
export function getStartOfCalendarDayOslo(date = new Date()): Date {
  // Format to Europe/Oslo YYYY-MM-DD
  const osloDateString = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date); // outputs "YYYY-MM-DD"

  // Create Date at 00:00:00 Oslo time
  // Using Date.parse with offset or constructing ISO string
  const startOfDay = new Date(`${osloDateString}T00:00:00Z`);
  return startOfDay;
}

/**
 * Compute full quota & daily test limits for a user
 */
export async function getUserDailyTestStatus(userId: string) {
  // 1. Fetch user to check tier
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const tier: 'FREE' | 'STANDARD' | 'PREMIUM' = user?.subscriptionTier || 'FREE';

  // 2. Fetch tier policy
  const tierPolicies = await getTierConfigs();
  const baseLimit = tierPolicies[tier]?.dailyTestLimit ?? DEFAULT_TIER_CONFIGS.FREE.dailyTestLimit;

  // 3. Fetch active referral bonuses
  const { bonusTests, activeRewardsCount } = await getActiveReferralBonusTests(userId);
  const totalAllowedToday = baseLimit + bonusTests;

  // 4. Count tests started by this user today (calendar day)
  // We consider sessions in status ACTIVE or COMPLETED started today
  const startOfDay = getStartOfCalendarDayOslo();
  const [usageCountResult] = await db
    .select({
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(examSessions)
    .where(
      and(
        eq(examSessions.userId, userId),
        gte(examSessions.startedAt, startOfDay)
      )
    );

  const testsUsedToday = usageCountResult?.count || 0;
  const remainingToday = Math.max(0, totalAllowedToday - testsUsedToday);

  return {
    userId,
    tier,
    baseLimit,
    bonusTests,
    activeRewardsCount,
    totalAllowedToday,
    testsUsedToday,
    remainingToday,
    canStartTest: remainingToday > 0,
    resetsAt: 'midnight Europe/Oslo',
  };
}
