import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_LOCALE,
  getStrings,
  isLocale,
  setCurrentLocale,
  translate,
  type Locale,
  type TranslationKey,
  type TranslationParams,
  type Translations,
} from '../i18n';

// UI language is a device preference, not account data, so plain AsyncStorage on every platform.
const LOCALE_KEY = 'norsk_app_locale';

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  /** The whole dictionary, for list-valued entries such as Terms sections. */
  strings: Translations;
  isLoading: boolean;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

export const LocaleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(LOCALE_KEY)
      .catch(() => null)
      .then((stored) => {
        if (cancelled) return;
        if (isLocale(stored)) {
          setCurrentLocale(stored);
          setLocaleState(stored);
        }
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setCurrentLocale(next);
    setLocaleState(next);
    AsyncStorage.setItem(LOCALE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo<LocaleContextType>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
      strings: getStrings(locale),
      isLoading,
    }),
    [locale, setLocale, isLoading]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
};

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
}
