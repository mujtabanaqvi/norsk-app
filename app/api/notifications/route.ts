import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, AuthenticationError } from '@/lib/auth';
import {
  getUserNotifications,
  markAllNotificationsAsRead,
  sendDailyCreditsNotification,
} from '@/lib/notification-service';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateUser(req);
    const searchParams = req.nextUrl.searchParams;

    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const limit = parseInt(searchParams.get('limit') || '30', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Opportunistically ensure daily credit notification exists for today
    try {
      await sendDailyCreditsNotification(auth.userId);
    } catch (e) {
      console.warn('[Notifications GET] Failed auto-issuing daily credits notification:', e);
    }

    const { notifications, unreadCount } = await getUserNotifications(auth.userId, {
      unreadOnly,
      limit,
      offset,
    });

    return NextResponse.json({
      notifications,
      unreadCount,
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    console.error('[GET /api/notifications] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await authenticateUser(req);
    const body = await req.json().catch(() => ({}));

    if (body.readAll === true) {
      const updatedCount = await markAllNotificationsAsRead(auth.userId);
      return NextResponse.json({ success: true, updatedCount });
    }

    return NextResponse.json({ error: 'Bad Request', message: 'Unknown action' }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    console.error('[PATCH /api/notifications] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

