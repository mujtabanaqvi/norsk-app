import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, AuthenticationError } from '@/lib/auth';
import { markNotificationAsRead, deleteUserNotification } from '@/lib/notification-service';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateUser(req);
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: 'Missing notification id' }, { status: 400 });
    }

    const updated = await markNotificationAsRead(auth.userId, id);
    if (!updated) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    console.error('[PATCH /api/notifications/:id] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateUser(req);
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: 'Missing notification id' }, { status: 400 });
    }

    const deleted = await deleteUserNotification(auth.userId, id);
    if (!deleted) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    console.error('[DELETE /api/notifications/:id] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

