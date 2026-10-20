import { z } from 'zod';
import { DEFAULT_LOCALE, translate, type Locale, type TranslationKey } from '../i18n';

/**
 * Shared auth validation schemas, used by both the app screens and the API routes
 * so client-side and server-side rules never drift apart.
 *
 * Schema messages are i18n keys (see src/i18n). They are translated when errors are read via
 * `fieldErrors` / `validateField` / `validationMessage`, so the API answers in Norwegian by default.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const OTP_LENGTH = 6;

const msg = (key: TranslationKey) => key;

const MESSAGE_PARAMS = {
  min: PASSWORD_MIN_LENGTH,
  max: PASSWORD_MAX_LENGTH,
  otp: OTP_LENGTH,
};

/** Translates a schema message key (other strings pass through unchanged). */
export function validationMessage(message: string, locale: Locale = DEFAULT_LOCALE): string {
  return translate(locale, message, MESSAGE_PARAMS);
}

export function passwordRulesHint(locale: Locale = DEFAULT_LOCALE): string {
  return validationMessage('validation.passwordRulesHint', locale);
}

export const emailSchema = z
  .string({ required_error: msg('validation.emailRequired') })
  .trim()
  .min(1, msg('validation.emailRequired'))
  .max(254, msg('validation.emailTooLong'))
  .email(msg('validation.emailInvalid'))
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string({ required_error: msg('validation.passwordRequired') })
  .min(1, msg('validation.passwordRequired'))
  .min(PASSWORD_MIN_LENGTH, msg('validation.passwordMin'))
  .max(PASSWORD_MAX_LENGTH, msg('validation.passwordMax'))
  .regex(/\p{L}/u, msg('validation.passwordLetter'))
  .regex(/\d/, msg('validation.passwordDigit'));

export const nameSchema = z
  .string({ required_error: msg('validation.nameRequired') })
  .trim()
  .min(1, msg('validation.nameRequired'))
  .min(2, msg('validation.nameMin'))
  .max(80, msg('validation.nameMax'));

export const referralCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => value === '' || /^[0-9A-F]{8}$/.test(value), {
    message: msg('validation.referralFormat'),
  })
  .transform((value) => (value === '' ? undefined : value))
  .optional();

export const otpSchema = z
  .string({ required_error: msg('validation.codeRequired') })
  .trim()
  .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), msg('validation.codeFormat'));

export const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z
      .string({ required_error: msg('validation.confirmRequired') })
      .min(1, msg('validation.confirmRequired')),
    referralCode: referralCodeSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: msg('validation.passwordsMismatch'),
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ required_error: msg('validation.passwordRequired') })
    .min(1, msg('validation.passwordRequired')),
});

export const verifyEmailSchema = z.object({
  email: emailSchema,
  code: otpSchema,
});

export const resendVerificationSchema = z.object({
  email: emailSchema,
});

export type RegisterInput = z.input<typeof registerSchema>;
export type LoginInput = z.input<typeof loginSchema>;
export type FieldErrors = Record<string, string>;

/** Flattens a ZodError into `{ field: firstMessage }`, translated to `locale`. */
export function fieldErrors(error: z.ZodError, locale: Locale = DEFAULT_LOCALE): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!result[key]) {
      result[key] = validationMessage(issue.message, locale);
    }
  }
  return result;
}

/**
 * Validates a single field of a form schema. Returns the error message or null.
 * Validates the whole object so cross-field rules (confirmPassword) are applied too.
 */
export function validateField<T extends z.ZodTypeAny>(
  schema: T,
  values: Record<string, unknown>,
  field: string,
  locale: Locale = DEFAULT_LOCALE
): string | null {
  const parsed = schema.safeParse(values);
  if (parsed.success) return null;
  return fieldErrors(parsed.error, locale)[field] ?? null;
}
