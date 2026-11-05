import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdminRequest } from '@/lib/admin-auth';
import {
  createBroadcastNotification,
  getAdminNotificationStats,
} from '@/lib/notification-service';

const createBroadcastSchema = z.object({
  type: z
    .enum(['DAILY_CREDITS', 'PRACTICE_REMINDER', 'ANNOUNCEMENT', 'PROMOTION', 'SYSTEM'])
    .default('ANNOUNCEMENT'),
  titleNo: z.string().trim().min(1, 'Tittel på norsk er påkrevd'),
  titleEn: z.string().trim().optional(),
  messageNo: z.string().trim().min(1, 'Melding på norsk er påkrevd'),
  messageEn: z.string().trim().optional(),
  actionRoute: z.string().trim().optional(),
  targetAudience: z.enum(['ALL', 'FREE', 'STANDARD', 'PREMIUM', 'CUSTOM']).default('ALL'),
  targetUserId: z.string().trim().optional(),
});

export async function GET(req: NextRequest) {
  const auth = verifyAdminRequest(req);
  if (!auth.authorized) {
    return auth.errorResponse!;
  }

  try {
    const searchParams = req.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const { items, total } = await getAdminNotificationStats(limit, offset);
    return NextResponse.json({ items, total });
  } catch (error) {
    console.error('[GET /api/admin/notifications] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown error' },
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
    const body = await req.json().catch(() => ({}));
    const parsed = createBroadcastSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { notification, deliveredCount } = await createBroadcastNotification({
      ...parsed.data,
      createdById: 'ADMIN',
    });

    return NextResponse.json({
      success: true,
      notification,
      deliveredCount,
    });
  } catch (error) {
    console.error('[POST /api/admin/notifications] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

