import { nb } from './nb';
import { en } from './en';
import type { Locale, Translations, TranslationKey, TranslationParams } from './types';

export type { Locale, Translations, TranslationKey, TranslationParams } from './types';

export const DEFAULT_LOCALE: Locale = 'nb';
export const LOCALES: readonly Locale[] = ['nb', 'en'];

const DICTIONARIES: Record<Locale, Translations> = { nb, en };

/** BCP 47 tag for number/date formatting. */
export const LOCALE_TAGS: Record<Locale, string> = { nb: 'nb-NO', en: 'en-GB' };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Falls back to the default locale for anything unrecognised (e.g. `?lang=de`). */
export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function getStrings(locale: Locale): Translations {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

function lookup(dict: Translations, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  );
}

/** True when `key` names a string in the dictionary (used for keys carried as plain strings). */
export function hasTranslation(key: string): boolean {
  return lookup(DICTIONARIES[DEFAULT_LOCALE], key) !== undefined;
}

/**
 * Translates a dotted key, falling back to Norwegian and then to the key itself.
 * Accepts plain strings too so keys stored in data (e.g. zod messages) can be passed through.
 */
export function translate(
  locale: Locale,
  key: TranslationKey | (string & {}),
  params?: TranslationParams
): string {
  const template =
    lookup(getStrings(locale), key) ?? lookup(DICTIONARIES[DEFAULT_LOCALE], key) ?? key;
  return interpolate(template, params);
}

// Module-level locale for non-React code (src/api.ts). Kept in sync by LocaleProvider.
let currentLocale: Locale = DEFAULT_LOCALE;

export function getCurrentLocale(): Locale {
  return currentLocale;
}

export function setCurrentLocale(locale: Locale): void {
  currentLocale = locale;
}
