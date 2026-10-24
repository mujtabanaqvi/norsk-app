/**
 * Public links to the marketing website (snakkly-frontend-website) and the support address.
 * The website hosts the legal pages: /vilkar (terms) and /personvern (privacy, incl. #slett-konto).
 */

export interface PublicLinks {
  websiteUrl: string;
  termsUrl: string;
  privacyUrl: string;
  accountDeletionUrl: string;
  supportEmail: string;
}

export function getWebsiteBaseUrl(): string {
  return (process.env.REFERRAL_LINK_BASE_URL || 'https://snakkly.no').replace(/\/+$/, '');
}

export function getSupportEmail(): string {
  return process.env.SUPPORT_EMAIL?.trim() || 'support@snakkly.no';
}

export function getPublicLinks(): PublicLinks {
  const websiteUrl = getWebsiteBaseUrl();
  return {
    websiteUrl,
    termsUrl: `${websiteUrl}/vilkar`,
    privacyUrl: `${websiteUrl}/personvern`,
    accountDeletionUrl: `${websiteUrl}/personvern#slett-konto`,
    supportEmail: getSupportEmail(),
  };
}
