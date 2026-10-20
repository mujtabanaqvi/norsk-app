import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';
import { fieldErrors as toFieldErrors } from '@/src/validation/auth';
import { DEFAULT_LOCALE, translate } from '@/src/i18n';

/**
 * Consistent error response shape for auth endpoints:
 * { error: <MACHINE_CODE>, message: <user-facing norsk>, fieldErrors?, ...extra }
 */
export function apiError(
  status: number,
  error: string,
  message: string,
  extra: Record<string, unknown> = {}
) {
  return NextResponse.json({ error, message, ...extra }, { status });
}

export function validationError(zodError: ZodError) {
  const fieldErrors = toFieldErrors(zodError);
  const first = Object.values(fieldErrors)[0];
  return apiError(400, 'VALIDATION_ERROR', first || translate(DEFAULT_LOCALE, 'validation.invalidData'), { fieldErrors });
}

/** Better Auth APIError → its machine code (e.g. EMAIL_NOT_VERIFIED). */
export function betterAuthErrorCode(error: any): string {
  return String(error?.body?.code || error?.code || error?.body?.message || error?.message || '');
}
