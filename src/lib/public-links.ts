import { useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { fetchPublicLinks } from '../api';
import { translate, type Locale } from '../i18n';

/**
 * Website/legal links and the support email, served by GET /api/config/links (from REFERRAL_LINK_BASE_URL
 * and SUPPORT_EMAIL on the server). The defaults cover the first render and offline use.
 */
export interface PublicLinks {
  websiteUrl: string;
  termsUrl: string;
  privacyUrl: string;
  accountDeletionUrl: string;
  supportEmail: string;
}

export const DEFAULT_PUBLIC_LINKS: PublicLinks = {
  websiteUrl: 'https://snakkly.no',
  termsUrl: 'https://snakkly.no/vilkar',
  privacyUrl: 'https://snakkly.no/personvern',
  accountDeletionUrl: 'https://snakkly.no/personvern#slett-konto',
  supportEmail: 'support@snakkly.no',
};

let cached: PublicLinks | null = null;
let inflight: Promise<PublicLinks> | null = null;

export function loadPublicLinks(): Promise<PublicLinks> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetchPublicLinks()
      .then((links: Partial<PublicLinks>) => {
        const merged: PublicLinks = { ...DEFAULT_PUBLIC_LINKS, ...links };
        cached = merged;
        return merged;
      })
      .catch(() => {
        inflight = null; // retry on the next screen that asks
        return DEFAULT_PUBLIC_LINKS;
      });
  }
  return inflight;
}

export function usePublicLinks(): PublicLinks {
  const [links, setLinks] = useState<PublicLinks>(cached ?? DEFAULT_PUBLIC_LINKS);
  useEffect(() => {
    let active = true;
    loadPublicLinks().then((value) => active && setLinks(value));
    return () => {
      active = false;
    };
  }, []);
  return links;
}

/** The website's legal pages are Norwegian by default; `?lang=en` shows the English version. */
export function localizedUrl(url: string, locale: Locale): string {
  if (locale !== 'en') return url;
  const [base, hash] = url.split('#');
  const withLang = `${base}${base.includes('?') ? '&' : '?'}lang=en`;
  return hash === undefined ? withLang : `${withLang}#${hash}`;
}

export function openExternalUrl(url: string): void {
  Linking.openURL(url).catch(() => {});
}

/** Opens the mail app; if there is none, shows the address so the user can write manually. */
export function openSupportEmail(
  locale: Locale,
  email: string,
  options: { subject?: string; body?: string } = {}
): void {
  const query = [
    options.subject && `subject=${encodeURIComponent(options.subject)}`,
    options.body && `body=${encodeURIComponent(options.body)}`,
  ]
    .filter(Boolean)
    .join('&');
  Linking.openURL(`mailto:${email}${query ? `?${query}` : ''}`).catch(() => {
    Alert.alert(translate(locale, 'support.title'), translate(locale, 'support.noMailApp', { email }));
  });
}
