import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, AuthenticationError } from '@/lib/auth';
import { registerUserPushToken, unregisterUserPushToken } from '@/lib/notification-service';

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateUser(req);
    const body = await req.json().catch(() => ({}));
    const { token, platform } = body;

    if (!token || typeof token !== 'string' || !token.trim()) {
      return NextResponse.json({ error: 'Push token is required' }, { status: 400 });
    }

    const cleanToken = token.trim();
    const cleanPlatform =
      platform === 'ios' || platform === 'web' || platform === 'android' ? platform : 'android';

    await registerUserPushToken(auth.userId, cleanToken, cleanPlatform);

    return NextResponse.json({ success: true, message: 'Push token registered successfully' });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    console.error('[POST /api/notifications/push-token] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateUser(req);
    const body = await req.json().catch(() => ({}));
    const { token } = body;

    if (!token || typeof token !== 'string' || !token.trim()) {
      return NextResponse.json({ error: 'Push token is required' }, { status: 400 });
    }

    const removed = await unregisterUserPushToken(auth.userId, token.trim());

    return NextResponse.json({ success: true, removed });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: 'Unauthorized', message: error.message }, { status: 401 });
    }
    console.error('[DELETE /api/notifications/push-token] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

