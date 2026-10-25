import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/db';
import { users, referralRewards } from '@/src/db/schema';
import { eq, desc, or } from 'drizzle-orm';
import { authenticateUser, AuthenticationError } from '@/lib/auth';
import { getReferralSettings, isRewardActiveToday } from '@/lib/tier-policy';
import { getWebsiteBaseUrl } from '@/lib/public-links';

// Served by the marketing website (snakkly-frontend-website, app/r/[code]); opens the app via Universal/App Links.
const REFERRAL_LINK_BASE_URL = getWebsiteBaseUrl();

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateUser(req);

    const [user] = await db
      .select({
        id: users.id,
        referralCode: users.referralCode,
        email: users.email,
        name: users.name,
      })
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User Not Found' }, { status: 404 });
    }

    const referralSettings = await getReferralSettings();

    // Rewards benefit both sides: those earned by referring friends, plus the welcome bonus
    // this user got for signing up with someone else's code.
    const allRewards = await db
      .select({
        id: referralRewards.id,
        referrerUserId: referralRewards.referrerUserId,
        referredUserId: referralRewards.referredUserId,
        bonusTestsPerDay: referralRewards.bonusTestsPerDay,
        startsAt: referralRewards.startsAt,
        expiresAt: referralRewards.expiresAt,
        createdAt: referralRewards.createdAt,
      })
      .from(referralRewards)
      .where(or(eq(referralRewards.referrerUserId, user.id), eq(referralRewards.referredUserId, user.id)))
      .orderBy(desc(referralRewards.createdAt));

    const rewards = allRewards.filter((r) => r.referrerUserId === user.id);
    const welcomeBonus = allRewards.find((r) => r.referredUserId === user.id) ?? null;

    const now = new Date();
    const activeRewards = allRewards.filter((r) => isRewardActiveToday(r, now));

    return NextResponse.json({
      referralCode: user.referralCode,
      referralLink: `${REFERRAL_LINK_BASE_URL}/r/${user.referralCode}`,
      referralSettings,
      stats: {
        totalReferredCount: rewards.length,
        activeRewardsCount: activeRewards.length,
        currentBonusTestsPerDay: activeRewards.reduce((sum, r) => sum + r.bonusTestsPerDay, 0),
      },
      rewards,
      welcomeBonus,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    console.error('Error fetching referral details:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

