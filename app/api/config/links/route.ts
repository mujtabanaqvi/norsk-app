import { NextResponse } from 'next/server';
import { getPublicLinks } from '@/lib/public-links';

/** Public website/legal links and the support email, so the app needs no rebuild when they change. */
export function GET() {
  return NextResponse.json(getPublicLinks(), {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
