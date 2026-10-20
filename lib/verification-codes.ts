import crypto from 'crypto';

/**
 * Pure helpers for email verification codes/tokens (no DB access, unit-testable).
 */

export const VERIFICATION_TTL_MINUTES = 15;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_CODE_ATTEMPTS = 5;

export interface VerificationRecord {
  userId: string;
  codeHash: string;
  tokenHash: string;
  attempts: number;
}

export function verificationIdentifier(email: string): string {
  return `email-verify:${email.toLowerCase().trim()}`;
}

export function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/** Constant-time comparison of a plain secret against a stored SHA-256 hex hash. */
export function secretMatches(secret: string, storedHash: string): boolean {
  const a = Buffer.from(hashSecret(secret), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function parseVerificationRecord(value: string): VerificationRecord | null {
  try {
    const parsed = JSON.parse(value);
    if (
      parsed &&
      typeof parsed.userId === 'string' &&
      typeof parsed.codeHash === 'string' &&
      typeof parsed.tokenHash === 'string'
    ) {
      return {
        userId: parsed.userId,
        codeHash: parsed.codeHash,
        tokenHash: parsed.tokenHash,
        attempts: Number(parsed.attempts) || 0,
      };
    }
  } catch {}
  return null;
}

export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** Seconds until another code may be sent, or 0 if a resend is allowed now. */
export function cooldownRemaining(createdAt: Date | null | undefined, now: Date = new Date()): number {
  if (!createdAt) return 0;
  const elapsed = (now.getTime() - createdAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed));
}
