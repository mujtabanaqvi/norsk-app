import React from 'react';

export default function SubscriptionCanceledPage() {
  return (
    <main className="snakkly-center-shell">
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
            backgroundColor: 'var(--navy-soft)',
            color: 'var(--navy)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
          }}
          aria-hidden="true"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
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
          Bestilling avbrutt
        </h1>
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.98rem',
            lineHeight: 1.55,
            margin: '0 0 1.75rem',
          }}
        >
          Betalingen ble ikke fullført, og kortet ditt ble ikke belastet. Du kan når som helst prøve
          igjen for å oppgradere abonnementet ditt.
        </p>

        <a href="/" className="snakkly-btn-primary">
          Tilbake til appen
        </a>
      </div>
    </main>
  );
}
