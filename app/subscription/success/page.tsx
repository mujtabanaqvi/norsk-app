import React, { Suspense } from 'react';
import Link from 'next/link';

export default function SubscriptionSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
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
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            color: '#10B981',
            fontSize: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
            border: '1px solid #10B981',
          }}
        >
          ✓
        </div>

        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.75rem' }}>
          Takk for ditt kjøp!
        </h1>
        <p style={{ color: '#94A3B8', fontSize: '1rem', lineHeight: '1.5', marginBottom: '2rem' }}>
          Ditt abonnement er nå aktivert. Du har fått utvidet din daglige testkvote og kan nå øve
          videre til muntlig Norskprøve.
        </p>

        <a
          href="/"
          style={{
            display: 'inline-block',
            backgroundColor: '#2563EB',
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

