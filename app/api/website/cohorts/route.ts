import { NextResponse } from 'next/server';
import { asAdmin } from '@/lib/db';

export const dynamic = 'force-dynamic';

const ORIGINS = new Set(['https://elimuplus.com', 'https://www.elimuplus.com']);
const cors = (req: Request) => {
  const o = req.headers.get('origin') ?? '';
  return { 'Access-Control-Allow-Origin': ORIGINS.has(o) ? o : 'https://elimuplus.com', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Accept', Vary: 'Origin' };
};

export async function OPTIONS(req: Request) { return new NextResponse(null, { status: 204, headers: cors(req) }); }

/** The cohort cards and the next forum date the website shows. Only published listings, only the card wording; a founder publishes each one in the portal. */
export async function GET(req: Request) {
  try {
    const row = (await asAdmin((q) => q('select app.public_cohort_listings() r, app.public_next_forum() f')))[0];
    return NextResponse.json({ cohorts: row?.r ?? [], next_forum: row?.f ?? null }, { headers: { ...cors(req), 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } });
  } catch {
    return NextResponse.json({ cohorts: null }, { status: 503, headers: cors(req) });
  }
}
