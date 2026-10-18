import { NextResponse } from 'next/server';
import { asAdmin } from '@/lib/db';
import { FEED_QUERIES, parseRss } from '@/lib/news';

export const dynamic = 'force-dynamic';

/** Free morning feed (Vercel cron): pulls a few Google News RSS searches per region. Raw headlines only; the curated digest is better. */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  let saved = 0;
  const errors: string[] = [];
  for (const f of FEED_QUERIES) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(f.q + ' when:3d')}&hl=en-KE&gl=KE&ceid=KE:en`;
      const res = await fetch(url, { headers: { 'user-agent': 'ElimuPlusPortal/1.0' }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) { errors.push(`${f.region} ${res.status}`); continue; }
      for (const i of parseRss(await res.text(), 8)) {
        const r = await asAdmin((q) => q(
          `insert into news_items (region, title, summary, source_name, source_url, published_on, origin) values ($1,$2,'',$3,$4,$5,'feed') on conflict (source_url) do nothing returning id`,
          [f.region, i.title.slice(0, 220), i.source, i.link, i.published_on]));
        saved += r.length;
      }
    } catch (e: any) { errors.push(`${f.region} ${e?.message ?? 'error'}`); }
  }
  return NextResponse.json({ saved, errors });
}
