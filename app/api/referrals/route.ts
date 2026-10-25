import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/db';
import { users, referralRewards } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
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

    // Fetch referral history
    const rewards = await db
      .select({
        id: referralRewards.id,
        referredUserId: referralRewards.referredUserId,
        bonusTestsPerDay: referralRewards.bonusTestsPerDay,
        startsAt: referralRewards.startsAt,
        expiresAt: referralRewards.expiresAt,
        createdAt: referralRewards.createdAt,
      })
      .from(referralRewards)
      .where(eq(referralRewards.referrerUserId, user.id))
      .orderBy(desc(referralRewards.createdAt));

    const now = new Date();
    const activeRewards = rewards.filter((r) => isRewardActiveToday(r, now));

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
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    console.error('Error fetching referral details:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

