import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { authenticateUser, AuthenticationError } from '@/lib/auth';
import { getUserDailyTestStatus } from '@/lib/tier-policy';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateUser(req);

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        image: users.image,
        role: users.role,
        subscriptionTier: users.subscriptionTier,
        referralCode: users.referralCode,
        referredByUserId: users.referredByUserId,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User Not Found' }, { status: 404 });
    }

    const testQuota = await getUserDailyTestStatus(user.id);

    return NextResponse.json({
      user,
      testQuota,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    console.error('Error fetching current user:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
