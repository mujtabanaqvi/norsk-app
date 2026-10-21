/**
 * Referral links (`https://snakkly.no/r/ABCD1234`) and the ways their code reaches a fresh install.
 * Pure helpers so they can be shared by the app and tests. The website (snakkly-frontend-website,
 * `lib/stores.ts`) must use the same clipboard prefix and Play Store `referrer` format.
 */

const REFERRAL_CODE_RE = /^[0-9A-F]{8}$/;

/** iOS has no install referrer: the landing page copies `<prefix><CODE>` before opening the App Store. */
export const REFERRAL_CLIPBOARD_PREFIX = 'Snakkly referral code: ';

export function normalizeReferralCode(raw: string | null | undefined): string | null {
  const code = (raw ?? '').trim().toUpperCase();
  return REFERRAL_CODE_RE.test(code) ? code : null;
}

/** `https://snakkly.no/r/CODE`, `https://www.snakkly.no/r/CODE` or `snakkly://r/CODE`. */
export function referralCodeFromUrl(url: string | null | undefined): string | null {
  const match = url?.match(/^(?:https?:\/\/(?:www\.)?snakkly\.no|snakkly:\/)\/r\/([^/?#]+)/i);
  return match ? normalizeReferralCode(match[1]) : null;
}

/** Google Play install referrer, e.g. `utm_source=referral&ref=CODE`. */
export function referralCodeFromInstallReferrer(referrer: string | null | undefined): string | null {
  const match = referrer?.match(/(?:^|&)ref=([^&]+)/);
  return match ? normalizeReferralCode(decodeURIComponentSafe(match[1])) : null;
}

/** Only the landing page's exact clipboard text, so arbitrary clipboard content never ends up in the form. */
export function referralCodeFromClipboardMarker(text: string | null | undefined): string | null {
  const trimmed = text?.trim() ?? '';
  if (!trimmed.toLowerCase().startsWith(REFERRAL_CLIPBOARD_PREFIX.toLowerCase())) return null;
  return normalizeReferralCode(trimmed.slice(REFERRAL_CLIPBOARD_PREFIX.length));
}

/** Lenient extraction for an explicit "Paste" tap: a bare code, a link, or the marker text. */
export function referralCodeFromPastedText(text: string | null | undefined): string | null {
  const trimmed = text?.trim() ?? '';
  return (
    normalizeReferralCode(trimmed) ??
    referralCodeFromUrl(trimmed) ??
    referralCodeFromClipboardMarker(trimmed) ??
    normalizeReferralCode(trimmed.match(/\b[0-9A-F]{8}\b/i)?.[0])
  );
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
