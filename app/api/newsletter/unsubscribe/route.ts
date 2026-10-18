import { NextResponse } from 'next/server';
import { tokenOk, unsubscribe } from '@/lib/newsletter';

export const dynamic = 'force-dynamic';

/** One-click unsubscribe used by mail apps (RFC 8058) and by the unsubscribe page. */
async function handle(req: Request) {
  const u = new URL(req.url);
  const email = (u.searchParams.get('e') ?? '').trim().toLowerCase();
  const token = u.searchParams.get('t') ?? '';
  if (!email || !tokenOk(email, token)) return NextResponse.json({ ok: false }, { status: 400 });
  await unsubscribe(email, 'link');
  return NextResponse.json({ ok: true });
}
export const POST = handle;
