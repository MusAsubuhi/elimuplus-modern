import { NextResponse } from 'next/server';
import { asAdmin } from '@/lib/db';

export const dynamic = 'force-dynamic';

const ORIGINS = new Set(['https://elimuplus.com', 'https://www.elimuplus.com']);
const cors = (req: Request) => {
  const o = req.headers.get('origin') ?? '';
  return { 'Access-Control-Allow-Origin': ORIGINS.has(o) ? o : 'https://elimuplus.com', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Accept', Vary: 'Origin' };
};

export async function OPTIONS(req: Request) { return new NextResponse(null, { status: 204, headers: cors(req) }); }

/** Headline numbers for the website: cohorts, cohorts at KE358, people. Numbers only, never names. Follow-up results join this once visits are recorded. */
export async function GET(req: Request) {
  try {
    const row = (await asAdmin((q) => q('select app.public_site_totals() t')))[0];
    return NextResponse.json(row?.t ?? null, { headers: { ...cors(req), 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } });
  } catch {
    return NextResponse.json(null, { status: 503, headers: cors(req) });
  }
}
