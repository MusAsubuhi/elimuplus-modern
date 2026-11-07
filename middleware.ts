import { NextResponse, type NextRequest } from 'next/server';
import { cardTitle, isPreviewBot, shareFor, SITE } from '@/lib/share-meta';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Link previews. WhatsApp, Slack, Facebook and the like cannot sign in, so without this every portal link would
 * preview as the login page. For those robots only, answer with a small page that carries the name of the page
 * and what it is for. Nothing private is in it, and people still sign in to see the real page.
 */
export function middleware(req: NextRequest) {
  const ua = req.headers.get('user-agent') || '';
  if (!isPreviewBot(ua)) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/portal/og')) return NextResponse.next();
  const s = shareFor(pathname);
  const title = cardTitle(s);
  const url = SITE + pathname;
  const img = `${SITE}/portal/og?p=${encodeURIComponent(pathname)}`;
  const alt = `${s.title}: ${s.description}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="robots" content="noindex,nofollow"><meta name="description" content="${esc(s.description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Elimu+ Portal"><meta property="og:locale" content="en_KE">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(s.description)}"><meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(img)}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(alt)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(s.description)}"><meta name="twitter:image" content="${esc(img)}"><meta name="twitter:image:alt" content="${esc(alt)}">
</head><body><h1>${esc(title)}</h1><p>${esc(s.description)}</p><p><a href="${esc(url)}">Open in the Elimu+ Portal</a></p></body></html>`;
  return new NextResponse(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-robots-tag': 'noindex' } });
}

export const config = { matcher: ['/portal/:path*', '/verify/:path*', '/seminar/:path*', '/unsubscribe'] };
