import { NextResponse } from 'next/server';
import { asAdmin } from '@/lib/db';
import { sendEnquiryAck } from '@/lib/enquiry';

export const dynamic = 'force-dynamic';

const ORIGINS = new Set(['https://elimuplus.com', 'https://www.elimuplus.com']);
const cors = (req: Request) => {
  const o = req.headers.get('origin') ?? '';
  return { 'Access-Control-Allow-Origin': ORIGINS.has(o) ? o : 'https://elimuplus.com', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Accept, Content-Type', Vary: 'Origin' };
};
const seen = new Map<string, number>(); // crude per-instance rate limit: 6 enquiries per IP per 10 minutes
const KINDS: Record<string, 'trainer' | 'organisation' | 'partner' | 'quote' | 'mentor'> = {
  'Elimu+ website: Trainer expression of interest': 'trainer',
  'Elimu+ website: Organisation registration': 'organisation',
  'Elimu+ website: Partner enquiry': 'partner',
  'Elimu+ website: Quote request': 'quote',
  'Elimu+ website: Mentor application': 'mentor',
};
const clip = (v: unknown, n: number) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, n);

export async function OPTIONS(req: Request) { return new NextResponse(null, { status: 204, headers: cors(req) }); }

/** Copy of a website form, sent by the site after Formspree has accepted it. Stored for a founder to review; creates no account. */
export async function POST(req: Request) {
  const h = cors(req);
  const ip = (req.headers.get('x-forwarded-for') ?? 'x').split(',')[0].trim();
  const now = Date.now();
  if (now - (seen.get(ip + ':t') ?? 0) >= 600000) { seen.set(ip, 0); seen.set(ip + ':t', now); }
  if ((seen.get(ip) ?? 0) >= 6) return NextResponse.json({ ok: false }, { status: 429, headers: h });
  seen.set(ip, (seen.get(ip) ?? 0) + 1);

  let f: FormData;
  try { f = await req.formData(); } catch { return NextResponse.json({ ok: false }, { status: 400, headers: h }); }
  if (String(f.get('_gotcha') ?? '')) return NextResponse.json({ ok: true }, { headers: h });
  const kind = KINDS[clip(f.get('_subject'), 120)];
  if (!kind) return NextResponse.json({ ok: false, error: 'unknown form' }, { status: 400, headers: h });

  const payload: Record<string, string> = {};
  for (const [k, v] of f.entries()) { if (typeof v === 'string' && !k.startsWith('_')) payload[clip(k, 40)] = clip(v, 2000); if (Object.keys(payload).length >= 40) break; }
  const name = clip(payload.full_name || payload.your_name || payload.contact_person || payload.name, 120);
  const email = clip(payload.email, 160).toLowerCase();
  const phone = clip(payload.phone || payload.whatsapp, 40);
  const orgName = clip(payload.institution_name || payload.organisation_name, 160);
  if (!name && !email && !phone) return NextResponse.json({ ok: false }, { status: 400, headers: h });
  const label = kind === 'trainer' ? 'Trainer interest' : kind === 'organisation' ? 'Organisation registration' : kind === 'partner' ? 'Partner enquiry' : kind === 'mentor' ? 'Mentor application' : 'Quote request';

  try {
    let newId = '';
    await asAdmin(async (q) => {
      const dup = (await q("select id from web_enquiries where kind=$1 and lower(coalesce(email,''))=$2 and created_at > now() - interval '10 minutes'", [kind, email]))[0];
      if (dup) return;
      const row = (await q('insert into web_enquiries(kind, name, email, phone, org_name, payload) values ($1,$2,$3,$4,$5,$6) returning id', [kind, name || null, email || null, phone || null, orgName || null, JSON.stringify(payload)]))[0];
      newId = row.id;
      await q(`insert into founder_alerts(kind, severity, title, body, link, source_table, source_id) values ('enquiry','attention',$1,$2,'/portal/enquiries','web_enquiries',$3)`,
        [`New website enquiry: ${label}`, `${name || email || 'Someone'}${orgName ? ` (${orgName})` : ''} filled in the ${label.toLowerCase()} form on the website. ${kind === 'mentor' ? 'Open Website enquiries to read it and start vetting. A mentor never gets a sign-in until you have vetted them.' : 'Open Website enquiries to review it and create their sign-in.'}`, row.id]);
    });
    if (newId && email) await sendEnquiryAck(newId);
  } catch (e) { console.error('[enquiry]', e); return NextResponse.json({ ok: false }, { status: 502, headers: h }); }
  return NextResponse.json({ ok: true }, { headers: h });
}
