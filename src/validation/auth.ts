import { z } from 'zod';

/**
 * Shared auth validation schemas, used by both the app screens and the API routes
 * so client-side and server-side rules never drift apart.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const OTP_LENGTH = 6;

export const PASSWORD_RULES_HINT = `Minst ${PASSWORD_MIN_LENGTH} tegn, med minst én bokstav og ett tall.`;

export const emailSchema = z
  .string({ required_error: 'E-post er påkrevd' })
  .trim()
  .min(1, 'E-post er påkrevd')
  .max(254, 'E-postadressen er for lang')
  .email('Ugyldig e-postadresse')
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string({ required_error: 'Passord er påkrevd' })
  .min(1, 'Passord er påkrevd')
  .min(PASSWORD_MIN_LENGTH, `Passordet må ha minst ${PASSWORD_MIN_LENGTH} tegn`)
  .max(PASSWORD_MAX_LENGTH, `Passordet kan ha maks ${PASSWORD_MAX_LENGTH} tegn`)
  .regex(/\p{L}/u, 'Passordet må inneholde minst én bokstav')
  .regex(/\d/, 'Passordet må inneholde minst ett tall');

export const nameSchema = z
  .string({ required_error: 'Navn er påkrevd' })
  .trim()
  .min(1, 'Navn er påkrevd')
  .min(2, 'Navnet må ha minst 2 tegn')
  .max(80, 'Navnet kan ha maks 80 tegn');

export const referralCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => value === '' || /^[0-9A-F]{8}$/.test(value), {
    message: 'Vervekoden må bestå av 8 tegn (0-9, A-F)',
  })
  .transform((value) => (value === '' ? undefined : value))
  .optional();

export const otpSchema = z
  .string({ required_error: 'Koden er påkrevd' })
  .trim()
  .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `Koden må bestå av ${OTP_LENGTH} sifre`);

export const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string({ required_error: 'Bekreft passordet' }).min(1, 'Bekreft passordet'),
    referralCode: referralCodeSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passordene er ikke like',
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ required_error: 'Passord er påkrevd' }).min(1, 'Passord er påkrevd'),
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

/** Flattens a ZodError into `{ field: firstMessage }`. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!result[key]) {
      result[key] = issue.message;
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
  field: string
): string | null {
  const parsed = schema.safeParse(values);
  if (parsed.success) return null;
  return fieldErrors(parsed.error)[field] ?? null;
}
