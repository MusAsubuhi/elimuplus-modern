import { NextResponse } from 'next/server';
import { syncNewsletter } from '@/lib/brevo';

export const dynamic = 'force-dynamic';

/** Daily (Vercel cron) and on demand: sends newly consented participants and partners to the Brevo newsletter list. */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  return NextResponse.json(await syncNewsletter());
}
