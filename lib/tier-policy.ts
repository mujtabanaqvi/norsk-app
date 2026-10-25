import { db } from '@/src/db';
import { tierConfigs, systemConfigs, referralRewards, examSessions, users } from '@/src/db/schema';
import { eq, and, or, gte, lt, sql } from 'drizzle-orm';

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

// An ACTIVE exam with no activity for this long is treated as left early and stops using a daily slot
export const ABANDONED_AFTER_MS = 30 * 60 * 1000;

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
 * A reward counts for the whole Oslo calendar day if it is active at any point during it,
 * so a bonus that expires mid-day doesn't shrink the limit after tests were already taken.
 */
export function isRewardActiveToday(
  reward: { startsAt: Date | string; expiresAt: Date | string },
  now = new Date()
): boolean {
  const startOfDay = getStartOfCalendarDayOslo(now);
  const endOfDay = getEndOfCalendarDayOslo(now);
  return new Date(reward.startsAt) < endOfDay && new Date(reward.expiresAt) >= startOfDay;
}

/**
 * Calculate the user's active referral bonus tests per day for today.
 * Each reward benefits both sides: the referrer and the friend who signed up with their code.
 */
export async function getActiveReferralBonusTests(
  userId: string,
  now = new Date()
): Promise<{ bonusTests: number; activeRewardsCount: number; bonusExpiresAt: string | null }> {
  try {
    const activeRewards = await db
      .select()
      .from(referralRewards)
      .where(
        and(
          or(eq(referralRewards.referrerUserId, userId), eq(referralRewards.referredUserId, userId)),
          lt(referralRewards.startsAt, getEndOfCalendarDayOslo(now)),
          gte(referralRewards.expiresAt, getStartOfCalendarDayOslo(now))
        )
      );

    const bonusTests = activeRewards.reduce((sum, r) => sum + r.bonusTestsPerDay, 0);
    // Earliest expiry, so the user isn't told bonus tests last longer than they do
    const bonusExpiresAt = activeRewards.length
      ? new Date(Math.min(...activeRewards.map((r) => new Date(r.expiresAt).getTime()))).toISOString()
      : null;
    return { bonusTests, activeRewardsCount: activeRewards.length, bonusExpiresAt };
  } catch {
    return { bonusTests: 0, activeRewardsCount: 0, bonusExpiresAt: null };
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

  // Midnight UTC on that date, shifted back by Oslo's offset (+01:00 or +02:00).
  // DST changes happen at 02:00/03:00, so the offset at UTC midnight is the one in effect at Oslo midnight.
  const utcMidnight = new Date(`${osloDateString}T00:00:00Z`);
  return new Date(utcMidnight.getTime() - getOsloOffsetMs(utcMidnight));
}

/**
 * Get end of calendar day in Europe/Oslo timezone (= start of the next day, exclusive)
 */
export function getEndOfCalendarDayOslo(date = new Date()): Date {
  // +36h always lands on the next Oslo day, even on 23/25-hour DST days
  const start = getStartOfCalendarDayOslo(date);
  return getStartOfCalendarDayOslo(new Date(start.getTime() + 36 * 60 * 60 * 1000));
}

function getOsloOffsetMs(date: Date): number {
  const offsetName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Oslo',
    timeZoneName: 'longOffset',
  })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value; // e.g. "GMT+02:00" ("GMT" when zero)

  const match = offsetName?.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const minutes = parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
  return (match[1] === '-' ? -minutes : minutes) * 60 * 1000;
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

  // 3. Fetch referral bonuses active at any point today
  const now = new Date();
  const { bonusTests, activeRewardsCount, bonusExpiresAt } = await getActiveReferralBonusTests(userId, now);
  const totalAllowedToday = baseLimit + bonusTests;

  // 4. Count tests started by this user today (Oslo calendar day) that are finished or still in
  // progress. Failed attempts and ones left early (no activity for ABANDONED_AFTER_MS) don't count,
  // matching the history screen, which lists only finished exams.
  const startOfDay = getStartOfCalendarDayOslo(now);
  const activeSince = new Date(now.getTime() - ABANDONED_AFTER_MS);
  // Last activity = newest transcript entry (epoch ms), falling back to the start time
  const lastActivityAt = sql`greatest(
    ${examSessions.startedAt},
    to_timestamp(coalesce((${examSessions.transcriptJson} -> -1 ->> 'timestamp')::bigint, 0) / 1000.0)
  )`;
  const [usageCountResult] = await db
    .select({
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(examSessions)
    .where(
      and(
        eq(examSessions.userId, userId),
        gte(examSessions.startedAt, startOfDay),
        or(
          eq(examSessions.status, 'COMPLETED'),
          and(eq(examSessions.status, 'ACTIVE'), sql`${lastActivityAt} >= ${activeSince}`)
        )
      )
    );

  const testsUsedToday = usageCountResult?.count || 0;
  const remainingToday = Math.max(0, totalAllowedToday - testsUsedToday);

  return {
    userId,
    tier,
    baseLimit,
    bonusTests,
    bonusExpiresAt,
    activeRewardsCount,
    totalAllowedToday,
    testsUsedToday,
    remainingToday,
    canStartTest: remainingToday > 0,
    resetsAt: 'midnight Europe/Oslo',
    resetsAtIso: getEndOfCalendarDayOslo(now).toISOString(),
  };
}
