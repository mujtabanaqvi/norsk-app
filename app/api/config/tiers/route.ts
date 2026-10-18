import { NextRequest, NextResponse } from 'next/server';
import { getTierConfigs, getReferralSettings } from '@/lib/tier-policy';

export async function GET(req: NextRequest) {
  try {
    const [tiers, referralSettings] = await Promise.all([
      getTierConfigs(),
      getReferralSettings(),
    ]);

    return NextResponse.json({
      tiers,
      referralSettings,
    });
  } catch (error) {
    console.error('Error fetching tiers config:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

