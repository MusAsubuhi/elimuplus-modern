import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { unsubscribe } from '@/lib/newsletter';

export const dynamic = 'force-dynamic';

/** Brevo calls this when someone unsubscribes, hard-bounces or reports spam. The secret is part of the webhook address Brevo was given. */
export async function POST(req: Request) {
  const want = process.env.CRON_SECRET ?? '';
  const given = new URL(req.url).searchParams.get('k') ?? '';
  const a = Buffer.from(want), b = Buffer.from(given);
  if (!want || a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ ok: false }, { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const event = String(body.event ?? '');
  const email = String(body.email ?? '').trim().toLowerCase();
  const reasons: Record<string, string> = { unsubscribe: 'brevo unsubscribe', unsubscribed: 'brevo unsubscribe', hard_bounce: 'hard bounce', hardBounce: 'hard bounce', spam: 'spam complaint', complaint: 'spam complaint' };
  if (email && reasons[event]) await unsubscribe(email, reasons[event]);
  return NextResponse.json({ ok: true });
}
