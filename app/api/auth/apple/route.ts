import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, AuthenticationError } from '@/lib/auth';

/**
 * Sign in with Apple verification endpoint.
 * Prepared architecture: In the future when Apple Developer Account credentials
 * (Apple Services ID, Team ID, Key ID, and Private Key) are configured,
 * verify the identityToken / authorizationCode and link to `oauth_accounts`.
 */
export async function POST(req: NextRequest) {
  try {
    return NextResponse.json(
      {
        error: 'Not Implemented',
        message: 'Apple ID innlogging vil bli aktivert i en fremtidig oppdatering.',
        supported: false,
      },
      { status: 501 }
    );
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

