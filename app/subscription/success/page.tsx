import React from 'react';
import { resolveLocale, translate } from '@/src/i18n';

export default async function SubscriptionSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; lang?: string }>;
}) {
  const locale = resolveLocale((await searchParams).lang);
  return (
    <main className="snakkly-center-shell" lang={locale}>
      <div
        className="snakkly-card"
        style={{
          maxWidth: '460px',
          width: '100%',
          padding: '2.5rem 2rem',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1.5rem',
          }}
        >
          <img src="/brand/snakkly-logo.svg" alt="Snakkly" width={36} height={38} />
          <span
            style={{
              fontSize: '1.35rem',
              fontWeight: 800,
              letterSpacing: '-0.03em',
            }}
          >
            <span style={{ color: 'var(--navy)' }}>Snakk</span>
            <span style={{ color: 'var(--red)' }}>ly</span>
          </span>
        </div>

        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'var(--success-soft)',
            color: 'var(--success)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
          }}
          aria-hidden="true"
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h1
          style={{
            fontSize: '1.65rem',
            fontWeight: 800,
            color: 'var(--navy)',
            margin: '0 0 0.65rem',
            letterSpacing: '-0.02em',
          }}
        >
          {translate(locale, 'web.successTitle')}
        </h1>
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.98rem',
            lineHeight: 1.55,
            margin: '0 0 1.75rem',
          }}
        >
          {translate(locale, 'web.successBody')}
        </p>

        <a href="/" className="snakkly-btn-primary">
          {translate(locale, 'web.backToApp')}
        </a>
      </div>
    </main>
  );
}
