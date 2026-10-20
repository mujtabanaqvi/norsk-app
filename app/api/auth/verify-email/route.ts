import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { signUserToken } from '@/lib/auth';
import { emailSchema, verifyEmailSchema } from '@/src/validation/auth';
import { apiError, validationError } from '@/lib/api-errors';
import { verifyByCode, verifyByToken, type VerifyResult } from '@/lib/email-verification';

const FAILURE_MESSAGES: Record<Exclude<VerifyResult, { ok: true }>['reason'], string> = {
  INVALID_CODE: 'Koden er feil. Sjekk e-posten og prøv igjen.',
  EXPIRED: 'Koden har utløpt. Be om en ny kode.',
  TOO_MANY_ATTEMPTS: 'For mange feil forsøk. Be om en ny kode.',
};

/**
 * POST { email, code } — verify with the 6-digit code from the app; logs the user in on success.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = verifyEmailSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const { email, code } = parsed.data;
    const result = await verifyByCode(email, code);

    if (!result.ok) {
      return apiError(400, result.reason, FAILURE_MESSAGES[result.reason], {
        fieldErrors: { code: FAILURE_MESSAGES[result.reason] },
        ...(result.attemptsLeft !== undefined ? { attemptsLeft: result.attemptsLeft } : {}),
      });
    }

    const [userRecord] = await db.select().from(users).where(eq(users.id, result.userId)).limit(1);
    if (!userRecord) {
      return apiError(404, 'USER_NOT_FOUND', 'Brukeren finnes ikke');
    }

    const token = signUserToken({
      id: userRecord.id,
      email: userRecord.email,
      role: userRecord.role,
    });

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.name,
        role: userRecord.role,
        subscriptionTier: userRecord.subscriptionTier,
        referralCode: userRecord.referralCode,
      },
    });
  } catch (error) {
    console.error('Email verification error:', error);
    return apiError(500, 'VERIFICATION_ERROR', 'Bekreftelsen mislyktes. Prøv igjen senere.');
  }
}

function htmlPage(title: string, message: string, success: boolean, status = 200) {
  const color = success ? '#1F7A4D' : '#BA0C2F';
  const html = `<!doctype html>
<html lang="no">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} · Snakkly</title>
  </head>
  <body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F6F7FA;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1B2440;padding:16px;box-sizing:border-box;">
    <main style="max-width:420px;width:100%;background:#fff;border-radius:16px;padding:32px;text-align:center;box-shadow:0 4px 24px rgba(27,36,64,.08);">
      <div style="font-size:22px;font-weight:700;color:#BA0C2F;margin-bottom:16px;">Snakkly</div>
      <h1 style="font-size:20px;margin:0 0 12px;color:${color};">${title}</h1>
      <p style="font-size:15px;line-height:1.5;margin:0;">${message}</p>
    </main>
  </body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * GET ?email&token — the link from the verification email.
 */
export async function GET(req: NextRequest) {
  const email = emailSchema.safeParse(req.nextUrl.searchParams.get('email') ?? '');
  const token = z.string().min(20).safeParse(req.nextUrl.searchParams.get('token') ?? '');

  if (!email.success || !token.success) {
    return htmlPage('Ugyldig lenke', 'Lenken er ufullstendig. Åpne lenken fra e-posten på nytt, eller bruk koden i appen.', false, 400);
  }

  try {
    const result = await verifyByToken(email.data, token.data);
    if (!result.ok) {
      return htmlPage(
        'Lenken er ikke gyldig',
        'Lenken har utløpt eller er allerede brukt. Logg inn i appen for å få en ny kode.',
        false,
        400
      );
    }
    return htmlPage(
      'E-posten er bekreftet!',
      'Takk! Gå tilbake til Snakkly-appen og logg inn med e-post og passord.',
      true
    );
  } catch (error) {
    console.error('Email link verification error:', error);
    return htmlPage('Noe gikk galt', 'Vi kunne ikke bekrefte e-posten akkurat nå. Prøv igjen senere.', false, 500);
  }
}
