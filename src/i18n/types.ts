import type { nb } from './nb';

export type Locale = 'nb' | 'en';

type DeepStrings<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? DeepStrings<U>[]
    : { [K in keyof T]: DeepStrings<T[K]> };

/** The dictionary shape every locale must provide (derived from `nb`). */
export type Translations = DeepStrings<typeof nb>;

type LeafKeys<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : T[K] extends readonly unknown[]
      ? never
      : LeafKeys<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Dotted path to a single string, e.g. `'setup.start'`. */
export type TranslationKey = LeafKeys<Translations>;

export type TranslationParams = Record<string, string | number>;
