import Link from 'next/link';
import { asAdmin } from '@/lib/db';
import { requireFeature } from '@/lib/access';
import { Badge, Card, PageHeader, inputCls, submitCls } from '@/components/ui';
import { REGIONS, regionLabel } from '@/lib/news';
import { addFollowup, finishFollowup, hideNews } from '../../news-actions';

export const dynamic = 'force-dynamic';
const ghost = 'rounded-lg border border-teal px-3 py-1.5 text-xs font-bold text-teal';
const d = (v: any) => (v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');

export default async function News({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const me = await requireFeature('news');
  const isFounder = me.roles.includes('founder');
  const r = (await searchParams).r;
  const region = REGIONS.some((x) => x.key === r) ? (r as string) : 'local';
  const { items, counts, follow } = await asAdmin(async (q) => ({
    items: await q(`select n.*, (select count(*)::int from news_followups f where f.item_id=n.id and f.status='open') open_follow
                    from news_items n where n.region=$1 and not n.hidden and coalesce(n.published_on, n.created_at::date) > current_date - 60
                    order by (n.origin='curated') desc, coalesce(n.published_on, n.created_at::date) desc, n.created_at desc limit 40`, [region]),
    counts: await q(`select region, count(*)::int n from news_items where not hidden and coalesce(published_on, created_at::date) > current_date - 60 group by region`),
    follow: await q(`select f.*, n.title, n.region, p.full_name who from news_followups f join news_items n on n.id=f.item_id left join people p on p.id=f.person_id
                     where f.status='open' order by f.created_at desc limit 20`),
  }));
  const count = (k: string) => counts.find((c: any) => c.region === k)?.n ?? 0;

  return (
    <>
      <PageHeader title="News and signals" subtitle="What is happening in entrepreneurship and employment, from Likoni to the whole continent. Curated items come with a short summary and why they matter; feed items are raw headlines." />
      <div className="mb-4 flex flex-wrap gap-2">
        {REGIONS.map((x) => (
          <Link key={x.key} href={`/portal/news?r=${x.key}`} className={`rounded-full border px-3 py-1.5 text-sm font-bold ${x.key === region ? 'border-teal bg-teal text-white' : 'border-teal-100 text-teal'}`}>{x.label} ({count(x.key)})</Link>))}
      </div>

      {follow.length > 0 && (
        <Card title={`Open follow-ups (${follow.length})`} className="mb-4">
          <ul className="space-y-2 text-sm">
            {follow.map((f: any) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-50 pb-2">
                <span><b>{f.title}</b> <span className="text-slate-500">({regionLabel(f.region)})</span><br />{f.note} <span className="text-xs text-slate-500">· {String(f.who ?? '').split(' ')[0]}</span></span>
                <form action={finishFollowup}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="region" value={region} /><button className={ghost}>Done</button></form>
              </li>))}
          </ul>
        </Card>)}

      {items.length === 0 ? <Card><p className="text-sm text-slate-600">Nothing in this region in the last two months. The morning digest and feed fill this in.</p></Card> : items.map((i: any) => (
        <Card key={i.id} title={i.title} className="mb-4" action={<div className="flex gap-2"><Badge tone={i.origin === 'curated' ? 'green' : 'grey'}>{i.origin === 'curated' ? 'Curated' : 'Feed'}</Badge>{i.open_follow > 0 && <Badge tone="gold">Follow-up open</Badge>}</div>}>
          <p className="text-xs text-slate-500">{[i.source_name, d(i.published_on)].filter(Boolean).join(' · ')}</p>
          {i.summary && <p className="mt-2 text-sm text-slate-700">{i.summary}</p>}
          {i.why_it_matters && <p className="mt-2 rounded-lg bg-[#F5FAF8] p-2 text-sm"><b className="text-teal">Why it matters to Elimu+:</b> {i.why_it_matters}</p>}
          <div className="mt-3 flex flex-wrap items-start gap-3">
            <a href={i.source_url} target="_blank" rel="noopener noreferrer" className={ghost}>Read the source</a>
            <details className="text-sm">
              <summary className="cursor-pointer font-bold text-teal">Follow up</summary>
              <form action={addFollowup} className="mt-2 flex flex-wrap gap-2"><input type="hidden" name="item" value={i.id} /><input type="hidden" name="region" value={region} />
                <input name="note" placeholder="What should we do? e.g. check eligibility, call, share with partners" className={`${inputCls} w-80`} /><button className={submitCls}>Save</button></form>
            </details>
            {isFounder && <form action={hideNews}><input type="hidden" name="item" value={i.id} /><input type="hidden" name="region" value={region} /><button className="text-xs text-slate-500 underline">Hide</button></form>}
          </div>
        </Card>))}
    </>
  );
}
