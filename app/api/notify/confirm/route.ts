import { NextResponse } from 'next/server';
import { sendConfirmation } from '@/lib/newsletter';

export const dynamic = 'force-dynamic';

const ORIGINS = new Set(['https://elimuplus.com', 'https://www.elimuplus.com']);
const cors = (req: Request) => {
  const o = req.headers.get('origin') ?? '';
  return { 'Access-Control-Allow-Origin': ORIGINS.has(o) ? o : 'https://elimuplus.com', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Accept, Content-Type', Vary: 'Origin' };
};
export async function OPTIONS(req: Request) { return new NextResponse(null, { status: 204, headers: cors(req) }); }

/** Called by the website after the organisation or trainer form is sent, so the person gets an acknowledgement email. */
export async function POST(req: Request) {
  const h = cors(req);
  let f: FormData;
  try { f = await req.formData(); } catch { return NextResponse.json({ ok: false }, { status: 400, headers: h }); }
  if (String(f.get('_gotcha') ?? '')) return NextResponse.json({ ok: true }, { headers: h });
  const kind = String(f.get('kind') ?? '');
  const email = String(f.get('email') ?? '').trim().toLowerCase().slice(0, 160);
  const name = String(f.get('name') ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const organisation = String(f.get('organisation') ?? '').trim().slice(0, 120);
  if ((kind !== 'org' && kind !== 'trainer') || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ ok: false }, { status: 400, headers: h });
  try { await sendConfirmation(kind === 'org' ? 'confirm_org' : 'confirm_trainer', email, name, organisation); }
  catch (e) { console.error('[confirm]', e); return NextResponse.json({ ok: false }, { status: 502, headers: h }); }
  return NextResponse.json({ ok: true }, { headers: h });
}
