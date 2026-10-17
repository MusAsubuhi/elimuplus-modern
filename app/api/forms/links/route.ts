import { NextResponse } from 'next/server';
import { asAdmin } from '@/lib/db';
import { validSecret } from '@/lib/forms-auth';

export const dynamic = 'force-dynamic';

const KINDS = new Set(['followup', 'start_end', 'cohort', 'report', 'other']);
const okUrl = (v: unknown) => (typeof v === 'string' && /^https:\/\/(docs\.google\.com|forms\.gle)\//.test(v) ? v.slice(0, 500) : null);
const count = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null; };

/**
 * The Forms script posts where each form and its response sheet live, and how many responses Google holds for it.
 * Body: { forms: [{ key, title, kind, fill_url, edit_url, sheet_url, google_responses, last_response_at }] }
 */
export async function POST(req: Request) {
  if (!validSecret(req.headers.get('x-forms-secret'))) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const forms: any[] = Array.isArray(b?.forms) ? b.forms.slice(0, 200) : [];
  if (!forms.length) return NextResponse.json({ ok: false, rejected: 'no forms in the request' });
  let saved = 0;
  await asAdmin(async (q) => {
    for (const f of forms) {
      const key = String(f?.key ?? '').trim().slice(0, 80);
      const title = String(f?.title ?? '').trim().slice(0, 200);
      if (!key || !title) continue;
      const kind = KINDS.has(f.kind) ? f.kind : 'other';
      const last = f.last_response_at && !Number.isNaN(Date.parse(f.last_response_at)) ? new Date(f.last_response_at).toISOString() : null;
      await q(
        `insert into form_registry(key, title, kind, fill_url, edit_url, sheet_url, google_responses, last_response_at, checked_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8, now())
         on conflict (key) do update set title = excluded.title, kind = excluded.kind, fill_url = excluded.fill_url, edit_url = excluded.edit_url,
           sheet_url = excluded.sheet_url, google_responses = excluded.google_responses, last_response_at = excluded.last_response_at, checked_at = now()`,
        [key, title, kind, okUrl(f.fill_url), okUrl(f.edit_url), okUrl(f.sheet_url), count(f.google_responses), last]);
      saved++;
    }
  });
  return NextResponse.json({ ok: true, saved });
}
