import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdminRequest } from '@/lib/admin-auth';
import {
  triggerDailyCreditsBroadcast,
  triggerPracticeRemindersBroadcast,
} from '@/lib/notification-service';

const triggerSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('TRIGGER_DAILY_CREDITS'),
  }),
  z.object({
    action: z.literal('TRIGGER_PRACTICE_REMINDERS'),
    daysThreshold: z.number().int().min(1).max(30).default(2),
  }),
]);

export async function POST(req: NextRequest) {
  const auth = verifyAdminRequest(req);
  if (!auth.authorized) {
    return auth.errorResponse!;
  }

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = triggerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    if (parsed.data.action === 'TRIGGER_DAILY_CREDITS') {
      const result = await triggerDailyCreditsBroadcast();
      return NextResponse.json({
        success: true,
        action: 'TRIGGER_DAILY_CREDITS',
        result,
      });
    }

    if (parsed.data.action === 'TRIGGER_PRACTICE_REMINDERS') {
      const result = await triggerPracticeRemindersBroadcast(parsed.data.daysThreshold);
      return NextResponse.json({
        success: true,
        action: 'TRIGGER_PRACTICE_REMINDERS',
        result,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[POST /api/admin/notifications/triggers] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

