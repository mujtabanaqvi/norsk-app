/**
 * Transactional email delivery via the Resend REST API.
 * https://resend.com/docs/api-reference/emails/send-email
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Snakkly <onboarding@resend.dev>';

export interface VerificationEmailParams {
  to: string;
  name?: string | null;
  code: string;
  link: string;
  expiresInMinutes: number;
}

export interface ResendPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildVerificationEmail(
  params: VerificationEmailParams,
  from: string = process.env.EMAIL_FROM || DEFAULT_FROM
): ResendPayload {
  const greeting = params.name ? `Hei ${params.name}!` : 'Hei!';
  const subject = `${params.code} er din bekreftelseskode for Snakkly`;

  const text = [
    greeting,
    '',
    'Takk for at du registrerte deg hos Snakkly. Bekreft e-postadressen din med koden under:',
    '',
    `    ${params.code}`,
    '',
    'Eller åpne denne lenken:',
    params.link,
    '',
    `Koden og lenken er gyldige i ${params.expiresInMinutes} minutter.`,
    'Hvis du ikke opprettet en konto, kan du se bort fra denne e-posten.',
  ].join('\n');

  const html = `<!doctype html>
<html lang="no">
  <body style="margin:0;padding:0;background:#F6F7FA;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1B2440;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border-radius:16px;padding:32px;">
          <tr><td>
            <h1 style="margin:0 0 8px;font-size:22px;color:#BA0C2F;">Snakkly</h1>
            <p style="margin:0 0 16px;font-size:16px;">${escapeHtml(greeting)}</p>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">
              Takk for at du registrerte deg. Skriv inn koden under i appen for å bekrefte e-postadressen din:
            </p>
            <p style="margin:0 0 24px;text-align:center;font-size:34px;font-weight:700;letter-spacing:8px;color:#1B2440;">
              ${escapeHtml(params.code)}
            </p>
            <p style="margin:0 0 16px;font-size:15px;text-align:center;">eller</p>
            <p style="margin:0 0 24px;text-align:center;">
              <a href="${escapeHtml(params.link)}" style="display:inline-block;background:#BA0C2F;color:#FFFFFF;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:999px;">
                Bekreft e-post
              </a>
            </p>
            <p style="margin:0;font-size:13px;color:#6B7280;line-height:1.5;">
              Koden og lenken er gyldige i ${params.expiresInMinutes} minutter.
              Hvis du ikke opprettet en konto, kan du se bort fra denne e-posten.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { from, to: [params.to], subject, html, text };
}

export async function sendVerificationEmail(params: VerificationEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const payload = buildVerificationEmail(params);

  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('RESEND_API_KEY is not configured');
    }
    console.warn(
      `[email] RESEND_API_KEY missing — verification for ${params.to}: code=${params.code} link=${params.link}`
    );
    return;
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
}
