export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '800px', margin: '0 auto', lineHeight: '1.6' }}>
      <h1>Norskprøven Muntlig B1/B2 Simulator Backend</h1>
      <p>
        Backend control plane is active. This service powers the Norwegian oral exam practice mobile app via LiveKit, Drizzle ORM, and PostgreSQL.
      </p>

      <h2>Control Plane Endpoints</h2>
      <ul>
        <li>
          <code>POST /api/exam/start</code>: Authenticates candidate, verifies remainingSeconds &gt; 180, provisions session in PostgreSQL, creates LiveKit room with metadata, and mints access token.
        </li>
        <li>
          <code>POST /api/webhooks/agent-complete</code>: Receives usage metrics and transcript from LiveKit Agent Worker, calculates OpenAI/ElevenLabs/Deepgram costs, runs atomic DB transaction to update quotas and usage ledger, and triggers B1/B2 rubric evaluation.
        </li>
        <li>
          <code>GET /api/exam/:sessionId</code>: Fetches exam session status, full transcript, and B1/B2 rubric evaluation breakdown.
        </li>
        <li>
          <code>GET /api/quota</code> &amp; <code>POST /api/quota</code>: User quota inquiry and top-up.
        </li>
      </ul>
    </main>
  );
}

