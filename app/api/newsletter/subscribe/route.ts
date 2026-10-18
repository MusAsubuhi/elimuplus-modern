import { NextResponse } from 'next/server';
import { upsertContact } from '@/lib/brevo';

export const dynamic = 'force-dynamic';

const ORIGINS = new Set(['https://elimuplus.com', 'https://www.elimuplus.com']);
const cors = (req: Request) => {
  const o = req.headers.get('origin') ?? '';
  return { 'Access-Control-Allow-Origin': ORIGINS.has(o) ? o : 'https://elimuplus.com', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Accept, Content-Type', Vary: 'Origin' };
};
const seen = new Map<string, number>(); // crude per-instance rate limit: 5 sign-ups per IP per 10 minutes

export async function OPTIONS(req: Request) { return new NextResponse(null, { status: 204, headers: cors(req) }); }

/** Website footer signup. Needs the consent box ticked; a filled hidden field is treated as a bot and pretends to succeed. */
export async function POST(req: Request) {
  const h = cors(req);
  const ip = (req.headers.get('x-forwarded-for') ?? 'x').split(',')[0].trim();
  const now = Date.now();
  const hits = (seen.get(ip) ?? 0);
  if (hits >= 5 && now - (seen.get(ip + ':t') ?? 0) < 600000) return NextResponse.json({ ok: false, error: 'Too many tries. Please wait a few minutes.' }, { status: 429, headers: h });
  if (now - (seen.get(ip + ':t') ?? 0) >= 600000) { seen.set(ip, 0); seen.set(ip + ':t', now); }
  seen.set(ip, (seen.get(ip) ?? 0) + 1);

  let f: FormData;
  try { f = await req.formData(); } catch { return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400, headers: h }); }
  if (String(f.get('_gotcha') ?? '')) return NextResponse.json({ ok: true }, { headers: h });
  const email = String(f.get('email') ?? '').trim().toLowerCase().slice(0, 160);
  const name = String(f.get('name') ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ ok: false, error: 'Please enter a valid email address.' }, { status: 400, headers: h });
  if (String(f.get('consent') ?? '') !== 'yes') return NextResponse.json({ ok: false, error: 'Please tick the box to agree.' }, { status: 400, headers: h });
  try { await upsertContact(email, name ? { FIRSTNAME: name } : {}); }
  catch (e) { console.error('[newsletter subscribe]', e); return NextResponse.json({ ok: false, error: 'Could not subscribe right now.' }, { status: 502, headers: h }); }
  return NextResponse.json({ ok: true }, { headers: h });
}
