import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';

export interface AuthenticatedUser {
  userId: string;
  email?: string;
  role?: string;
  subscriptionTier?: 'FREE' | 'STANDARD' | 'PREMIUM';
  name?: string | null;
}

export class AuthenticationError extends Error {
  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'norsk-app-dev-secret-key-change-in-prod';

/**
 * Unverified identities (raw `x-user-id` header, `user_`/`candidate_`/`test_` tokens) let a caller
 * act as any user, so they are only honoured outside production.
 */
export function allowUnverifiedIdentity(env: string | undefined = process.env.NODE_ENV): boolean {
  return env !== 'production';
}

const UNVERIFIED_TOKEN_PREFIXES = ['candidate_', 'user_', 'test_'];

/**
 * Generate a JWT token for a user
 */
export function signUserToken(user: { id: string; email: string; role?: string }): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role || 'USER',
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

/**
 * Verify a JWT token
 */
export function verifyUserToken(token: string): { sub: string; email?: string; role?: string } {
  try {
    return jwt.verify(token, JWT_SECRET) as { sub: string; email?: string; role?: string };
  } catch {
    throw new AuthenticationError('Invalid or expired authentication token');
  }
}

import { auth as betterAuthInstance } from './better-auth';

export const ACCOUNT_DEACTIVATED_MESSAGE = 'Kontoen din er deaktivert. Kontakt support for hjelp.';

/** True when an admin has deactivated the account (see lib/user-admin.ts). */
export async function isUserDeactivated(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ deactivatedAt: users.deactivatedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return Boolean(row?.deactivatedAt);
}

async function assertUserActive(userId: string): Promise<void> {
  if (await isUserDeactivated(userId)) {
    throw new AuthenticationError(ACCOUNT_DEACTIVATED_MESSAGE);
  }
}

/**
 * Authenticates the user from incoming Next.js API Request.
 * Supports:
 * 1. Better Auth session (via cookies/headers)
 * 2. Bearer JWT / API Token header
 * 3. x-user-id header (dev testing only, see allowUnverifiedIdentity)
 */
export async function authenticateUser(
  request: Request | NextRequest
): Promise<AuthenticatedUser> {
  // 1. Try Better Auth session resolution
  let sessionData: Awaited<ReturnType<typeof betterAuthInstance.api.getSession>> = null;
  try {
    sessionData = await betterAuthInstance.api.getSession({
      headers: request.headers,
    });
  } catch {
    // Continue to Bearer / header fallback
  }
  if (sessionData && sessionData.user) {
    await assertUserActive(sessionData.user.id);
    return {
      userId: sessionData.user.id,
      email: sessionData.user.email,
      name: sessionData.user.name,
      role: (sessionData.user as any).role || 'USER',
      subscriptionTier: (sessionData.user as any).subscriptionTier || 'FREE',
    };
  }

  let token: string | null = null;
  const authHeader = request.headers.get('authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if ('nextUrl' in request && request.nextUrl?.searchParams) {
    token = request.nextUrl.searchParams.get('token') || request.nextUrl.searchParams.get('authToken');
  } else {
    try {
      const url = new URL(request.url);
      token = url.searchParams.get('token') || url.searchParams.get('authToken');
    } catch {}
  }

  if (token) {
    if (!token.trim()) {
      throw new AuthenticationError('Empty Bearer token provided');
    }
    const cleanToken = token.trim();

    let payload: ReturnType<typeof verifyUserToken>;
    try {
      payload = verifyUserToken(cleanToken);
    } catch {
      // Fallback for mock/candidate token in dev/tests (e.g. user_xxx or candidate_xxx)
      if (allowUnverifiedIdentity() && UNVERIFIED_TOKEN_PREFIXES.some((prefix) => cleanToken.startsWith(prefix))) {
        return { userId: cleanToken };
      }
      throw new AuthenticationError('Invalid authentication token');
    }
    // JWTs are valid for 30 days, so a deactivated user's already-issued token is cut off here
    await assertUserActive(payload.sub);
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }

  // Header-based fallback (e.g. from reverse proxy, mobile client gateway, or dev runner)
  const headerUserId = request.headers.get('x-user-id');
  if (allowUnverifiedIdentity() && headerUserId && headerUserId.trim().length > 0) {
    return { userId: headerUserId.trim() };
  }

  throw new AuthenticationError('Missing or invalid authentication credentials');
}

/**
 * Fetch full user record from database given authenticated user
 */
export async function getAuthenticatedUserRecord(request: Request | NextRequest) {
  const auth = await authenticateUser(request);
  const [userRecord] = await db.select().from(users).where(eq(users.id, auth.userId)).limit(1);
  return { auth, user: userRecord || null };
}
