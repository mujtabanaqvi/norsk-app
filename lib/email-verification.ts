import crypto from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/src/db';
import { users, verification, userQuotas, referralRewards } from '@/src/db/schema';
import { getReferralSettings } from '@/lib/tier-policy';
import { sendVerificationEmail } from '@/lib/email';
import {
  VERIFICATION_TTL_MINUTES,
  MAX_CODE_ATTEMPTS,
  verificationIdentifier,
  generateCode,
  generateToken,
  hashSecret,
  secretMatches,
  parseVerificationRecord,
  isExpired,
  cooldownRemaining,
} from '@/lib/verification-codes';

export type VerifyResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'INVALID_CODE' | 'EXPIRED' | 'TOO_MANY_ATTEMPTS'; attemptsLeft?: number };

export type IssueResult = { sent: true } | { sent: false; retryAfterSeconds: number };

function appBaseUrl(): string {
  return (
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/+$/, '');
}

async function latestRecord(email: string) {
  const [row] = await db
    .select()
    .from(verification)
    .where(eq(verification.identifier, verificationIdentifier(email)))
    .orderBy(desc(verification.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Creates a new code + link for the user (replacing any earlier one) and emails it.
 * Respects a resend cooldown unless `force` is set.
 */
export async function issueVerification(
  user: { id: string; email: string; name?: string | null },
  options: { force?: boolean } = {}
): Promise<IssueResult> {
  const email = user.email.toLowerCase().trim();
  const identifier = verificationIdentifier(email);

  if (!options.force) {
    const existing = await latestRecord(email);
    const wait = cooldownRemaining(existing?.createdAt);
    if (wait > 0) {
      return { sent: false, retryAfterSeconds: wait };
    }
  }

  const code = generateCode();
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + VERIFICATION_TTL_MINUTES * 60_000);

  await db.delete(verification).where(eq(verification.identifier, identifier));
  await db.insert(verification).values({
    id: `ver_${crypto.randomUUID()}`,
    identifier,
    value: JSON.stringify({
      userId: user.id,
      codeHash: hashSecret(code),
      tokenHash: hashSecret(token),
      attempts: 0,
    }),
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });

  const link = `${appBaseUrl()}/api/auth/verify-email?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;

  await sendVerificationEmail({
    to: email,
    name: user.name,
    code,
    link,
    expiresInMinutes: VERIFICATION_TTL_MINUTES,
  });

  return { sent: true };
}

async function verifySecret(
  email: string,
  secret: string,
  kind: 'code' | 'token'
): Promise<VerifyResult> {
  const row = await latestRecord(email);
  const record = row ? parseVerificationRecord(row.value) : null;

  if (!row || !record) {
    return { ok: false, reason: 'EXPIRED' };
  }
  if (isExpired(row.expiresAt)) {
    await db.delete(verification).where(eq(verification.id, row.id));
    return { ok: false, reason: 'EXPIRED' };
  }

  const matches = secretMatches(secret, kind === 'code' ? record.codeHash : record.tokenHash);

  if (!matches) {
    // Only codes are brute-forceable; a wrong link token is just invalid.
    if (kind === 'token') {
      return { ok: false, reason: 'INVALID_CODE' };
    }
    const attempts = record.attempts + 1;
    if (attempts >= MAX_CODE_ATTEMPTS) {
      await db.delete(verification).where(eq(verification.id, row.id));
      return { ok: false, reason: 'TOO_MANY_ATTEMPTS' };
    }
    await db
      .update(verification)
      .set({ value: JSON.stringify({ ...record, attempts }), updatedAt: new Date() })
      .where(eq(verification.id, row.id));
    return { ok: false, reason: 'INVALID_CODE', attemptsLeft: MAX_CODE_ATTEMPTS - attempts };
  }

  await db.delete(verification).where(eq(verification.id, row.id));
  await markEmailVerified(record.userId);
  return { ok: true, userId: record.userId };
}

export function verifyByCode(email: string, code: string) {
  return verifySecret(email, code, 'code');
}

export function verifyByToken(email: string, token: string) {
  return verifySecret(email, token, 'token');
}

/** Flips email_verified and runs first-verification side effects exactly once. */
export async function markEmailVerified(userId: string): Promise<void> {
  const updated = await db
    .update(users)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(and(eq(users.id, userId), eq(users.emailVerified, false)))
    .returning({ id: users.id });

  if (updated.length > 0) {
    await onEmailVerified(userId);
  }
}

/**
 * Account activation side effects: default quota and referral reward for the referrer.
 * Runs only for verified accounts so throwaway sign-ups can't farm referral bonuses.
 */
export async function onEmailVerified(userId: string): Promise<void> {
  await db
    .insert(userQuotas)
    .values({ userId, remainingAudioSeconds: 1800 })
    .onConflictDoNothing();

  const [userRecord] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const referrerUserId = userRecord?.referredByUserId;
  if (!referrerUserId || referrerUserId === userId) return;

  const [existingReward] = await db
    .select({ id: referralRewards.id })
    .from(referralRewards)
    .where(eq(referralRewards.referredUserId, userId))
    .limit(1);
  if (existingReward) return;

  const referralSettings = await getReferralSettings();
  const startsAt = new Date();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + referralSettings.durationDays);

  await db.insert(referralRewards).values({
    referrerUserId,
    referredUserId: userId,
    bonusTestsPerDay: referralSettings.bonusDailyTests,
    startsAt,
    expiresAt,
  });
}
