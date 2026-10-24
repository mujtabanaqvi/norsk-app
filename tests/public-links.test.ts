import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { getPublicLinks } from '../lib/public-links';
import { buildVerificationEmail } from '../lib/email';

const saved = { base: process.env.REFERRAL_LINK_BASE_URL, email: process.env.SUPPORT_EMAIL };

describe('Public website links and support email', () => {
  afterEach(() => {
    // Assigning undefined to process.env stores the string "undefined", so delete instead.
    if (saved.base === undefined) delete process.env.REFERRAL_LINK_BASE_URL;
    else process.env.REFERRAL_LINK_BASE_URL = saved.base;
    if (saved.email === undefined) delete process.env.SUPPORT_EMAIL;
    else process.env.SUPPORT_EMAIL = saved.email;
  });

  it('builds the legal page URLs from REFERRAL_LINK_BASE_URL and reads SUPPORT_EMAIL', () => {
    process.env.REFERRAL_LINK_BASE_URL = 'https://example.no/';
    process.env.SUPPORT_EMAIL = 'help@example.no';
    assert.deepStrictEqual(getPublicLinks(), {
      websiteUrl: 'https://example.no',
      termsUrl: 'https://example.no/vilkar',
      privacyUrl: 'https://example.no/personvern',
      accountDeletionUrl: 'https://example.no/personvern#slett-konto',
      supportEmail: 'help@example.no',
    });
  });

  it('falls back to snakkly.no and support@snakkly.no', () => {
    delete process.env.REFERRAL_LINK_BASE_URL;
    delete process.env.SUPPORT_EMAIL;
    const links = getPublicLinks();
    assert.strictEqual(links.termsUrl, 'https://snakkly.no/vilkar');
    assert.strictEqual(links.supportEmail, 'support@snakkly.no');
  });

  it('puts the support address and legal links in the verification email', () => {
    process.env.REFERRAL_LINK_BASE_URL = 'https://snakkly.no';
    process.env.SUPPORT_EMAIL = 'support@snakkly.no';
    const payload = buildVerificationEmail(
      { to: 'a@b.no', code: '123456', link: 'https://app.snakkly.no/verify', expiresInMinutes: 15 },
      'Snakkly <no-reply@snakkly.no>'
    );
    for (const part of [payload.text, payload.html]) {
      assert.ok(part.includes('support@snakkly.no'));
      assert.ok(part.includes('https://snakkly.no/vilkar'));
      assert.ok(part.includes('https://snakkly.no/personvern'));
    }
  });
});
