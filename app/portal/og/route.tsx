import { ImageResponse } from 'next/og';
import { shareFor } from '@/lib/share-meta';

// The picture shown in a shared link: the page name and what it is for, on the Elimu+ colours.
// Only names from the share table are ever drawn, so nobody can make this print their own words.
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams.get('p') || '/portal';
  const s = shareFor(p.startsWith('/') ? p.slice(0, 200) : '/portal');
  const big = s.title.length > 26;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#0D3B3B', padding: 72, color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', fontSize: 54, fontWeight: 800 }}>
            Elimu<span style={{ color: '#D4A843' }}>+</span>
            <span style={{ marginLeft: 18, fontSize: 28, fontWeight: 400, color: '#BFDCD6' }}>Portal</span>
          </div>
          <div style={{ display: 'flex', background: '#D4A843', color: '#0D3B3B', fontSize: 26, fontWeight: 800, padding: '10px 26px', borderRadius: 999 }}>{s.tag}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', width: 120, height: 8, background: '#D4A843', marginBottom: 34 }} />
          <div style={{ display: 'flex', fontSize: big ? 72 : 88, fontWeight: 800, lineHeight: 1.05 }}>{s.title}</div>
          <div style={{ display: 'flex', fontSize: 34, color: '#CFE5E0', marginTop: 28, lineHeight: 1.35, maxWidth: 980 }}>{s.description}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, color: '#BFDCD6' }}>
          <div style={{ display: 'flex' }}>Start. Start small. Start to finish.</div>
          <div style={{ display: 'flex', color: '#D4A843', fontWeight: 700 }}>portal.elimuplus.com</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=604800' } },
  );
}
