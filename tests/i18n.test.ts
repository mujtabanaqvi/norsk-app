import { describe, it } from 'node:test';
import assert from 'node:assert';
import { nb } from '../src/i18n/nb';
import { en } from '../src/i18n/en';
import { translate, interpolate, resolveLocale, hasTranslation, DEFAULT_LOCALE } from '../src/i18n';
import { registerSchema, fieldErrors, passwordRulesHint, PASSWORD_MIN_LENGTH } from '../src/validation/auth';

/** Every leaf path, with array lengths included, so a missing list item also shows up. */
function shape(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix];
  if (Array.isArray(node)) {
    return [`${prefix}[${node.length}]`, ...node.flatMap((item, i) => shape(item, `${prefix}[${i}]`))];
  }
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    shape(value, prefix ? `${prefix}.${key}` : key)
  );
}

function placeholders(node: unknown, prefix = ''): Record<string, string> {
  if (typeof node === 'string') {
    return { [prefix]: (node.match(/\{\w+\}/g) ?? []).sort().join(',') };
  }
  return Object.entries(node as Record<string, unknown>).reduce(
    (acc, [key, value]) => ({ ...acc, ...placeholders(value, prefix ? `${prefix}.${key}` : key) }),
    {}
  );
}

describe('i18n dictionaries', () => {
  it('nb and en have identical keys and list lengths', () => {
    assert.deepStrictEqual(shape(en).sort(), shape(nb).sort());
  });

  it('nb and en use the same {placeholders} for every string', () => {
    assert.deepStrictEqual(placeholders(en), placeholders(nb));
  });

  it('has no empty strings', () => {
    for (const [locale, dict] of Object.entries({ nb, en })) {
      const empty = Object.entries(placeholders(dict)).filter(([path]) => {
        const value = path.split('.').reduce<any>((n, k) => n?.[k], dict);
        return typeof value === 'string' && value.trim() === '';
      });
      assert.deepStrictEqual(empty, [], `${locale} has empty strings`);
    }
  });
});

describe('translate', () => {
  it('defaults to Norwegian', () => {
    assert.strictEqual(DEFAULT_LOCALE, 'nb');
    assert.strictEqual(translate('nb', 'common.back'), 'Tilbake');
    assert.strictEqual(translate('en', 'common.back'), 'Back');
  });

  it('interpolates params and leaves unknown placeholders intact', () => {
    assert.strictEqual(translate('en', 'setup.themesForLevel', { count: 4, level: 'B1' }), '4 themes for B1');
    assert.strictEqual(interpolate('Hei {name} {missing}', { name: 'Ola' }), 'Hei Ola {missing}');
  });

  it('falls back to the key for unknown keys', () => {
    assert.strictEqual(translate('en', 'nope.missing'), 'nope.missing');
    assert.ok(hasTranslation('apiErrors.EMAIL_TAKEN'));
    assert.ok(!hasTranslation('apiErrors.SOMETHING_NEW'));
  });

  it('resolves unknown locales to the default', () => {
    assert.strictEqual(resolveLocale('en'), 'en');
    assert.strictEqual(resolveLocale('de'), 'nb');
    assert.strictEqual(resolveLocale(undefined), 'nb');
  });
});

describe('localized validation messages', () => {
  const weak = { name: 'Ola', email: 'ola@eksempel.no', password: 'kort1', confirmPassword: 'kort1' };

  it('returns Norwegian by default (API contract unchanged)', () => {
    const res = registerSchema.safeParse(weak);
    assert.ok(!res.success);
    assert.strictEqual(fieldErrors(res.error).password, `Passordet må ha minst ${PASSWORD_MIN_LENGTH} tegn`);
  });

  it('returns English when asked', () => {
    const res = registerSchema.safeParse(weak);
    assert.ok(!res.success);
    assert.strictEqual(
      fieldErrors(res.error, 'en').password,
      `The password must be at least ${PASSWORD_MIN_LENGTH} characters`
    );
    assert.match(passwordRulesHint('en'), /^At least 8 characters/);
  });
});
