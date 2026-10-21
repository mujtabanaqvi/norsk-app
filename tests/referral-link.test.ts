import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  REFERRAL_CLIPBOARD_PREFIX,
  normalizeReferralCode,
  referralCodeFromClipboardMarker,
  referralCodeFromInstallReferrer,
  referralCodeFromPastedText,
  referralCodeFromUrl,
} from '../src/lib/referral-link';

describe('referral links', () => {
  it('normalizes valid codes and rejects invalid ones', () => {
    assert.equal(normalizeReferralCode(' abcd1234 '), 'ABCD1234');
    assert.equal(normalizeReferralCode('ABCD123'), null);
    assert.equal(normalizeReferralCode('ABCD123G'), null);
    assert.equal(normalizeReferralCode(undefined), null);
  });

  it('extracts the code from universal/app links and the custom scheme', () => {
    assert.equal(referralCodeFromUrl('https://snakkly.no/r/abcd1234'), 'ABCD1234');
    assert.equal(referralCodeFromUrl('https://www.snakkly.no/r/ABCD1234?utm=wa#x'), 'ABCD1234');
    assert.equal(referralCodeFromUrl('snakkly://r/ABCD1234'), 'ABCD1234');
    assert.equal(referralCodeFromUrl('https://evil.example/r/ABCD1234'), null);
    assert.equal(referralCodeFromUrl('https://snakkly.no/r/nope'), null);
    assert.equal(referralCodeFromUrl('https://snakkly.no/vilkar'), null);
    assert.equal(referralCodeFromUrl(null), null);
  });

  it('extracts the code from the Play install referrer', () => {
    assert.equal(referralCodeFromInstallReferrer('utm_source=referral&ref=abcd1234'), 'ABCD1234');
    assert.equal(referralCodeFromInstallReferrer('ref%3DABCD1234'), null);
    assert.equal(
      referralCodeFromInstallReferrer('utm_source=google-play&utm_medium=organic'),
      null
    );
    assert.equal(referralCodeFromInstallReferrer(''), null);
  });

  it('only accepts the landing page clipboard marker on first launch', () => {
    assert.equal(referralCodeFromClipboardMarker(`${REFERRAL_CLIPBOARD_PREFIX}ABCD1234`), 'ABCD1234');
    assert.equal(referralCodeFromClipboardMarker('ABCD1234'), null);
    assert.equal(referralCodeFromClipboardMarker('my password 12345678'), null);
  });

  it('is lenient for an explicit paste', () => {
    assert.equal(referralCodeFromPastedText('abcd1234'), 'ABCD1234');
    assert.equal(referralCodeFromPastedText('https://snakkly.no/r/ABCD1234'), 'ABCD1234');
    assert.equal(
      referralCodeFromPastedText('Sign up with my link: https://snakkly.no/r/ABCD1234 (or code ABCD1234)'),
      'ABCD1234'
    );
    assert.equal(referralCodeFromPastedText('hello'), null);
  });
});
