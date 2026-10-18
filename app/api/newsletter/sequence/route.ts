import { NextResponse } from 'next/server';
import { runSequence } from '@/lib/newsletter';

export const dynamic = 'force-dynamic';

/** Daily (Vercel cron): sends the next weekly letter to anyone due. Does nothing while the sequence is switched off. */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  return NextResponse.json(await runSequence());
}
