export default function HomePage() {
  return (
    <main className="snakkly-shell">
      <div className="snakkly-container">
        {/* Brand Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '2rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <img
              src="/brand/snakkly-logo.svg"
              alt="Snakkly"
              width={52}
              height={56}
              style={{ display: 'block' }}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span
                  style={{
                    fontSize: '1.75rem',
                    fontWeight: 800,
                    letterSpacing: '-0.03em',
                    color: 'var(--navy)',
                  }}
                >
                  <span style={{ color: 'var(--navy)' }}>Snakk</span>
                  <span style={{ color: 'var(--red)' }}>ly</span>
                </span>
                <span className="snakkly-badge">B1 / B2</span>
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Norskprøven Muntlig · Offisiell HK-dir Simulator Backend
              </div>
            </div>
          </div>
        </header>

        {/* Intro & Admin Portal Card */}
        <section className="snakkly-card" style={{ marginBottom: '2rem' }}>
          <p
            style={{
              margin: '0 0 1.25rem',
              fontSize: '1rem',
              lineHeight: 1.65,
              color: 'var(--text-secondary)',
            }}
          >
            Backend control plane is active. This service powers the{' '}
            <strong style={{ fontWeight: 700 }}>
              <span style={{ color: 'var(--navy)' }}>Snakk</span>
              <span style={{ color: 'var(--red)' }}>ly</span>
            </strong>{' '}
            Norwegian oral exam practice app (Expo Go &amp; Web) via a deterministic exam state
            machine, OpenAI STT/LLM, ElevenLabs TTS, Drizzle ORM, and Neon PostgreSQL.
          </p>

          <div
            style={{
              padding: '1.15rem 1.25rem',
              backgroundColor: 'var(--red-soft)',
              border: '1px solid var(--red)',
              borderRadius: '12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <strong style={{ color: 'var(--navy)', fontSize: '1rem' }}>Web Admin Portal</strong>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                Create and manage B1/B2 oral exams and question pools (Del 1, Del 2 &amp; Del 3).
              </div>
            </div>
            <a href="/admin" className="snakkly-btn-primary">
              Open Admin Portal &rarr;
            </a>
          </div>
        </section>

        {/* API Endpoints Card */}
        <section className="snakkly-card">
          <h2
            style={{
              margin: '0 0 1rem',
              fontSize: '1.15rem',
              fontWeight: 800,
              letterSpacing: '-0.01em',
              color: 'var(--navy)',
            }}
          >
            API Endpoints
          </h2>
          <ul className="snakkly-endpoint-list">
            <li className="snakkly-endpoint-item">
              <code>GET /api/exam/topics</code> Returns active B1/B2 exam topics and user audio quota.
            </li>
            <li className="snakkly-endpoint-item">
              <code>POST /api/exam/start</code> Verifies quota, picks a random (or specified) active
              exam &amp; Del 3 question subset, creates a new exam session, and returns the examiner
              opening greeting for Del 1.
            </li>
            <li className="snakkly-endpoint-item">
              <code>POST /api/exam/:sessionId/turn</code> Accepts recorded candidate audio, transcribes
              speech, advances the deterministic exam state machine (Del 1 &rarr; Del 2 &rarr; Del 3),
              and generates examiner or AI co-candidate responses.
            </li>
            <li className="snakkly-endpoint-item">
              <code>GET /api/exam/:sessionId/speech/:turnIndex</code> Streams MP3 voice synthesis from
              ElevenLabs (with OpenAI TTS fallback).
            </li>
            <li className="snakkly-endpoint-item">
              <code>POST /api/exam/:sessionId/finish</code> Finalizes session usage and triggers
              post-exam HK-dir rubric evaluation in the background.
            </li>
            <li className="snakkly-endpoint-item">
              <code>GET /api/exam/:sessionId/results</code> Polls session status, transcript, and
              CEFR B1/B2 rubric evaluation.
            </li>
            <li className="snakkly-endpoint-item">
              <code>GET /api/quota</code> &amp; <code>POST /api/quota</code> User quota inquiry and
              top-up.
            </li>
            <li className="snakkly-endpoint-item">
              <code>GET / POST / PATCH / DELETE /api/admin/exams</code> Web Admin Portal endpoints for
              creating and managing exams and question pools.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
