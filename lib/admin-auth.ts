import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_DEV_ADMIN_SECRET = 'admin123';

export function getExpectedAdminSecret(): string {
  const configured = process.env.ADMIN_SECRET?.trim();
  if (configured) {
    return configured;
  }
  return DEFAULT_DEV_ADMIN_SECRET;
}

/**
 * Validates that the incoming request originates from an authenticated Web Admin session.
 * Checks `x-admin-secret` header or `Authorization: Bearer <secret>`.
 */
export function verifyAdminRequest(req: NextRequest): {
  authorized: boolean;
  errorResponse?: NextResponse;
} {
  const expectedSecret = getExpectedAdminSecret();

  const headerSecret = req.headers.get('x-admin-secret')?.trim();
  const authHeader = req.headers.get('authorization')?.trim();
  const bearerSecret =
    authHeader && authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : undefined;

  const providedSecret = headerSecret || bearerSecret;

  if (!providedSecret || providedSecret !== expectedSecret) {
    return {
      authorized: false,
      errorResponse: NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Ugyldig eller manglende admin-nøkkel (ADMIN_SECRET).',
        },
        { status: 401 }
      ),
    };
  }

  return { authorized: true };
}

