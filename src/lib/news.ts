export const REGIONS = [
  { key: 'local', label: 'Likoni and Mombasa' },
  { key: 'national', label: 'Kenya' },
  { key: 'east_africa', label: 'East Africa' },
  { key: 'africa', label: 'Africa' },
] as const;
export const regionLabel = (k: string) => REGIONS.find((r) => r.key === k)?.label ?? k;
export const REGION_KEYS: string[] = REGIONS.map((r) => r.key);

/** Searches the free feed runs each morning (Google News RSS). Kept short on purpose. */
export const FEED_QUERIES: { region: string; q: string }[] = [
  { region: 'local', q: 'Mombasa OR Likoni youth jobs OR business OR training' },
  { region: 'national', q: 'Kenya youth employment OR SME OR jobs OR entrepreneurship' },
  { region: 'east_africa', q: 'East Africa entrepreneurship OR youth employment OR small business' },
  { region: 'africa', q: 'Africa youth employment OR entrepreneurship OR small business funding' },
];

const decode = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, '').trim();
const tag = (x: string, t: string) => decode(x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? '');

export function parseRss(xml: string, limit = 8) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, limit).map((m) => {
    const x = m[1];
    const title = tag(x, 'title'), link = tag(x, 'link'), source = tag(x, 'source'), pub = tag(x, 'pubDate');
    const d = pub ? new Date(pub) : null;
    return { title, link, source: source || null, published_on: d && !isNaN(+d) ? d.toISOString().slice(0, 10) : null };
  }).filter((i) => i.title && /^https:\/\//.test(i.link));
}
