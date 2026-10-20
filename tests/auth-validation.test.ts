import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  registerSchema,
  loginSchema,
  otpSchema,
  fieldErrors,
  validateField,
} from '../src/validation/auth';
import {
  generateCode,
  generateToken,
  hashSecret,
  secretMatches,
  parseVerificationRecord,
  isExpired,
  cooldownRemaining,
  verificationIdentifier,
  RESEND_COOLDOWN_SECONDS,
} from '../lib/verification-codes';
import { buildVerificationEmail } from '../lib/email';

const validRegistration = {
  name: 'Ola Nordmann',
  email: '  Ola@Eksempel.NO ',
  password: 'hemmelig123',
  confirmPassword: 'hemmelig123',
  referralCode: '',
};

describe('Auth validation schemas', () => {
  it('accepts a valid registration and normalises email + empty referral code', () => {
    const parsed = registerSchema.parse(validRegistration);
    assert.strictEqual(parsed.email, 'ola@eksempel.no');
    assert.strictEqual(parsed.name, 'Ola Nordmann');
    assert.strictEqual(parsed.referralCode, undefined);
  });

  it('uppercases a valid referral code and rejects malformed ones', () => {
    assert.strictEqual(registerSchema.parse({ ...validRegistration, referralCode: 'a1b2c3d4' }).referralCode, 'A1B2C3D4');
    const bad = registerSchema.safeParse({ ...validRegistration, referralCode: 'XYZ' });
    assert.ok(!bad.success);
    assert.ok(fieldErrors(bad.error).referralCode);
  });

  it('rejects weak passwords with a specific message', () => {
    const cases: Record<string, string> = {
      'kort1': 'minst 8 tegn',
      'bareboksstaver': 'ett tall',
      '1234567890': 'én bokstav',
    };
    for (const [password, expected] of Object.entries(cases)) {
      const res = registerSchema.safeParse({ ...validRegistration, password, confirmPassword: password });
      assert.ok(!res.success, `expected "${password}" to fail`);
      assert.match(fieldErrors(res.error).password, new RegExp(expected));
    }
  });

  it('accepts Norwegian letters in passwords', () => {
    const res = registerSchema.safeParse({ ...validRegistration, password: 'æøåæøå12', confirmPassword: 'æøåæøå12' });
    assert.ok(res.success);
  });

  it('flags mismatched password confirmation on confirmPassword', () => {
    const res = registerSchema.safeParse({ ...validRegistration, confirmPassword: 'annet123' });
    assert.ok(!res.success);
    assert.deepStrictEqual(Object.keys(fieldErrors(res.error)), ['confirmPassword']);
  });

  it('requires name and a valid email on registration', () => {
    const res = registerSchema.safeParse({ ...validRegistration, name: ' ', email: 'ikke-en-epost' });
    assert.ok(!res.success);
    const errors = fieldErrors(res.error);
    assert.ok(errors.name);
    assert.ok(errors.email);
  });

  it('login only requires a non-empty password', () => {
    assert.ok(loginSchema.safeParse({ email: 'a@b.no', password: 'x' }).success);
    assert.ok(!loginSchema.safeParse({ email: 'a@b.no', password: '' }).success);
  });

  it('validateField returns the error for one field only', () => {
    const values = { ...validRegistration, email: 'feil' };
    assert.ok(validateField(registerSchema, values, 'email'));
    assert.strictEqual(validateField(registerSchema, values, 'password'), null);
  });

  it('otp must be exactly 6 digits', () => {
    assert.ok(otpSchema.safeParse('012345').success);
    assert.ok(!otpSchema.safeParse('12345').success);
    assert.ok(!otpSchema.safeParse('12a456').success);
  });
});

describe('Email verification codes', () => {
  it('generates zero-padded 6-digit codes and long URL-safe tokens', () => {
    for (let i = 0; i < 50; i++) {
      assert.match(generateCode(), /^\d{6}$/);
    }
    const token = generateToken();
    assert.match(token, /^[A-Za-z0-9_-]{40,}$/);
  });

  it('matches secrets against their hash only', () => {
    const hash = hashSecret('123456');
    assert.ok(secretMatches('123456', hash));
    assert.ok(!secretMatches('654321', hash));
    assert.ok(!secretMatches('123456', 'not-a-hash'));
  });

  it('parses stored records and rejects garbage', () => {
    const record = { userId: 'u1', codeHash: 'a', tokenHash: 'b', attempts: 2 };
    assert.deepStrictEqual(parseVerificationRecord(JSON.stringify(record)), record);
    assert.strictEqual(parseVerificationRecord('{bad json'), null);
    assert.strictEqual(parseVerificationRecord(JSON.stringify({ userId: 'u1' })), null);
  });

  it('handles expiry and resend cooldown', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    assert.ok(isExpired(new Date('2026-01-01T11:59:59Z'), now));
    assert.ok(!isExpired(new Date('2026-01-01T12:15:00Z'), now));

    assert.strictEqual(cooldownRemaining(null, now), 0);
    assert.strictEqual(cooldownRemaining(new Date(now.getTime() - 10_000), now), RESEND_COOLDOWN_SECONDS - 10);
    assert.strictEqual(cooldownRemaining(new Date(now.getTime() - 120_000), now), 0);
  });

  it('normalises the identifier email', () => {
    assert.strictEqual(verificationIdentifier(' Ola@Eksempel.no '), 'email-verify:ola@eksempel.no');
  });
});

describe('Verification email payload', () => {
  it('includes code, link and escapes user-provided name', () => {
    const payload = buildVerificationEmail(
      {
        to: 'ola@eksempel.no',
        name: '<script>x</script>',
        code: '042517',
        link: 'https://app.example/api/auth/verify-email?email=ola%40eksempel.no&token=abc',
        expiresInMinutes: 15,
      },
      'Snakkly <no-reply@example.no>'
    );
    assert.deepStrictEqual(payload.to, ['ola@eksempel.no']);
    assert.strictEqual(payload.from, 'Snakkly <no-reply@example.no>');
    assert.match(payload.subject, /042517/);
    assert.match(payload.html, /042517/);
    assert.match(payload.html, /token=abc/);
    assert.ok(!payload.html.includes('<script>'));
    assert.match(payload.text, /15 minutter/);
  });
});
