export default function HomePage() {
  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        padding: '2rem',
        maxWidth: '800px',
        margin: '0 auto',
        lineHeight: '1.6',
      }}
    >
      <h1>Norskprøven Muntlig B1/B2 Simulator Backend</h1>
      <p>
        Backend control plane is active. This service powers the Norwegian oral exam practice mobile
        app (Expo Go &amp; Web) via a deterministic exam state machine, OpenAI STT/LLM, ElevenLabs
        TTS, Drizzle ORM, and Neon PostgreSQL.
      </p>

      <div
        style={{
          margin: '1.5rem 0',
          padding: '1rem 1.25rem',
          backgroundColor: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <strong>Web Admin Portal</strong>
          <div style={{ fontSize: '0.9rem', color: '#334155' }}>
            Create and manage B1/B2 oral exams and question pools (Del 1, Del 2 &amp; Del 3).
          </div>
        </div>
        <a
          href="/admin"
          style={{
            backgroundColor: '#0284c7',
            color: '#ffffff',
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Open Admin Portal &rarr;
        </a>
      </div>

      <h2>API Endpoints</h2>
      <ul>
        <li>
          <code>GET /api/exam/topics</code>: Returns active B1/B2 exam topics and user audio quota.
        </li>
        <li>
          <code>POST /api/exam/start</code>: Verifies quota, picks a random (or specified) active
          exam &amp; Del 3 question subset, creates a new exam session, and returns the examiner
          opening greeting for Del 1.
        </li>
        <li>
          <code>POST /api/exam/:sessionId/turn</code>: Accepts recorded candidate audio, transcribes
          speech, advances the deterministic exam state machine (Del 1 &rarr; Del 2 &rarr; Del 3),
          and generates examiner or AI co-candidate responses.
        </li>
        <li>
          <code>GET /api/exam/:sessionId/speech/:turnIndex</code>: Streams MP3 voice synthesis from
          ElevenLabs (with OpenAI TTS fallback).
        </li>
        <li>
          <code>POST /api/exam/:sessionId/finish</code>: Finalizes session usage and triggers
          post-exam HK-dir rubric evaluation in the background.
        </li>
        <li>
          <code>GET /api/exam/:sessionId/results</code>: Polls session status, transcript, and
          CEFR B1/B2 rubric evaluation.
        </li>
        <li>
          <code>GET /api/quota</code> &amp; <code>POST /api/quota</code>: User quota inquiry and
          top-up.
        </li>
        <li>
          <code>GET / POST / PATCH / DELETE /api/admin/exams</code>: Web Admin Portal endpoints for
          creating and managing exams and question pools.
        </li>
      </ul>
    </main>
  );
}
