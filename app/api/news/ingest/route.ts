import { NextResponse } from 'next/server';
import { asAdmin } from '@/lib/db';
import { REGION_KEYS } from '@/lib/news';

export const dynamic = 'force-dynamic';

/**
 * Receives the daily curated digest. POST { items: [{ region, title, summary, why_it_matters, source_name, source_url, published_on }] }
 * with header Authorization: Bearer <NEWS_INGEST_SECRET>. Existing links are updated, never duplicated.
 */
export async function POST(req: Request) {
  const secret = process.env.NEWS_INGEST_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const items: any[] = Array.isArray(body?.items) ? body.items.slice(0, 40) : [];
  let saved = 0, skipped = 0;
  for (const i of items) {
    const url = String(i.source_url ?? ''), title = String(i.title ?? '').slice(0, 220);
    if (!REGION_KEYS.includes(i.region) || !title || !/^https:\/\/\S+$/.test(url)) { skipped++; continue; }
    const d = /^\d{4}-\d{2}-\d{2}$/.test(String(i.published_on ?? '')) ? i.published_on : null;
    await asAdmin((q) => q(
      `insert into news_items (region, title, summary, why_it_matters, source_name, source_url, published_on, origin)
       values ($1,$2,$3,$4,$5,$6,$7,'curated')
       on conflict (source_url) do update set region=excluded.region, title=excluded.title, summary=excluded.summary,
         why_it_matters=excluded.why_it_matters, source_name=excluded.source_name, origin='curated'`,
      [i.region, title, String(i.summary ?? '').slice(0, 900), String(i.why_it_matters ?? '').slice(0, 500) || null, String(i.source_name ?? '').slice(0, 120) || null, url, d]));
    saved++;
  }
  return NextResponse.json({ saved, skipped });
}
