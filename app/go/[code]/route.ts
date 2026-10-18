import { NextResponse } from 'next/server';
import { asAdmin } from '@/lib/db';

export const dynamic = 'force-dynamic';
const BOT = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|slack|telegram|linkedinbot|twitterbot|headless|curl|wget/i;

/** Tracked short link: counts the click (people and bots kept apart), then sends the visitor on to the real address. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const fallback = 'https://elimuplus.com';
  try {
    const link = (await asAdmin((q) => q('select target_url from social_links where code=$1', [code.slice(0, 20)])))[0];
    if (!link) return NextResponse.redirect(fallback, 302);
    const bot = BOT.test(req.headers.get('user-agent') ?? '');
    await asAdmin((q) => q('insert into social_clicks (code, is_bot) values ($1,$2)', [code.slice(0, 20), bot])).catch(() => {});
    return NextResponse.redirect(link.target_url, 302);
  } catch {
    return NextResponse.redirect(fallback, 302);
  }
}
