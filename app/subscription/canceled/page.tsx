import React from 'react';

export default function SubscriptionCanceledPage() {
  return (
    <main
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        minHeight: '100vh',
        backgroundColor: '#0B0F19',
        color: '#F8FAFC',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <div
        style={{
          maxWidth: '480px',
          width: '100%',
          backgroundColor: '#1E293B',
          borderRadius: '16px',
          padding: '2.5rem',
          textAlign: 'center',
          border: '1px solid #334155',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            color: '#EF4444',
            fontSize: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
            border: '1px solid #EF4444',
          }}
        >
          ✕
        </div>

        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.75rem' }}>
          Bestilling avbrutt
        </h1>
        <p style={{ color: '#94A3B8', fontSize: '1rem', lineHeight: '1.5', marginBottom: '2rem' }}>
          Betalingen ble ikke fullført, og kortet ditt ble ikke belastet. Du kan når som helst prøve
          igjen for å oppgradere abonnementet ditt.
        </p>

        <a
          href="/"
          style={{
            display: 'inline-block',
            backgroundColor: '#334155',
            color: '#FFFFFF',
            padding: '0.875rem 2rem',
            borderRadius: '10px',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '1rem',
          }}
        >
          Tilbake til appen
        </a>
      </div>
    </main>
  );
}

