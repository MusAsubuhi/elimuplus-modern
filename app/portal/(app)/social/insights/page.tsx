import { asAdmin } from '@/lib/db';
import { requireFeature } from '@/lib/access';
import { Badge, Card, PageHeader, inputCls, submitCls } from '@/components/ui';
import { PLATFORMS, angleLabel } from '@/lib/social';
import { saveMetrics } from '../../../social-actions';

export const dynamic = 'force-dynamic';
const n = (v: any) => Number(v ?? 0);
const rate = (e: number, r: number) => (r > 0 ? `${((e / r) * 100).toFixed(1)}%` : '–');
const eng = (r: any) => n(r.reactions) + n(r.comments) + n(r.shares) + n(r.saves);
const nums = ['reach', 'reactions', 'comments', 'shares', 'saves', 'replies', 'followers_gained'] as const;
const label: Record<string, string> = { reach: 'Reach', reactions: 'Reactions', comments: 'Comments', shares: 'Shares', saves: 'Saves', replies: 'Replies', followers_gained: 'New followers' };

export default async function Insights() {
  await requireFeature('social_insights');
  const { rows, links } = await asAdmin(async (q) => ({
    rows: await q(`select sp.*, i.title, i.angle, i.pillar, i.scheduled_for from social_posts sp join social_ideas i on i.id=sp.idea_id order by sp.posted_at desc`),
    links: await q(`select l.code, l.platform, l.idea_id, i.title,
                      count(c.id) filter (where not c.is_bot)::int human, count(c.id) filter (where c.is_bot)::int bots
                    from social_links l join social_ideas i on i.id=l.idea_id left join social_clicks c on c.code=l.code
                    group by l.code, i.title order by human desc`),
  }));
  const clicksByIdea: Record<string, number> = {};
  for (const l of links) clicksByIdea[l.idea_id] = (clicksByIdea[l.idea_id] ?? 0) + n(l.human);
  const sum = (list: any[], k: string) => list.reduce((a, r) => a + n(r[k]), 0);
  const totalClicks = links.reduce((a: number, l: any) => a + n(l.human), 0);
  const group = (key: string) => {
    const m = new Map<string, any[]>();
    for (const r of rows) { const g = r[key] || 'Not set'; m.set(g, [...(m.get(g) ?? []), r]); }
    return [...m.entries()].map(([name, list]) => ({ name, list, reach: sum(list, 'reach'), e: list.reduce((a, r) => a + eng(r), 0), comments: sum(list, 'comments') }));
  };
  const missing = rows.filter((r: any) => !r.metrics_updated_at);
  const top = [...rows].filter((r: any) => n(r.reach) > 0).sort((a, b) => eng(b) / n(b.reach) - eng(a) / n(a.reach)).slice(0, 5);
  const th = 'px-2 py-1 text-left text-xs uppercase tracking-wide text-slate-500';
  const td = 'px-2 py-1.5 text-sm border-t border-teal-50';

  return (
    <>
      <PageHeader title="Social insights" subtitle="What is working. Link clicks are counted automatically; reactions, comments and the rest are typed in from each platform." />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[['Posts recorded', rows.length], ['Reach', sum(rows, 'reach')], ['Comments', sum(rows, 'comments')], ['Link clicks (people)', totalClicks], ['Engagement rate', rate(rows.reduce((a: number, r: any) => a + eng(r), 0), sum(rows, 'reach'))]].map(([k, v]) => (
          <div key={String(k)} className="rounded-xl border border-teal-50 bg-white p-3"><div className="text-xs text-slate-500">{k}</div><div className="text-2xl font-extrabold text-teal">{v}</div></div>))}
      </div>
      <p className="mb-4 text-xs text-slate-500">Engagement rate = (reactions + comments + shares + saves) ÷ reach. Treat patterns as hints until about 90 days of posts exist; one standout post is the exception.</p>

      {missing.length > 0 && (
        <Card title={`Numbers to add (${missing.length})`} className="mb-4">
          <p className="mb-3 text-sm text-slate-600">Check each post on its platform (Meta Business Suite, LinkedIn analytics, WhatsApp status views) a few days after posting, then type what you see. Leave unknown fields as 0.</p>
          <div className="space-y-4">
            {missing.slice(0, 12).map((r: any) => (
              <form key={r.id} action={saveMetrics} className="rounded-lg border border-teal-50 p-3">
                <input type="hidden" name="post" value={r.id} />
                <div className="mb-2 flex flex-wrap items-center gap-2"><b className="text-sm text-teal">{r.title}</b><Badge tone="grey">{PLATFORMS.find((p) => p.key === r.platform)?.label ?? r.platform}</Badge>{r.post_url && <a href={r.post_url} target="_blank" className="text-xs text-teal underline">open post</a>}<span className="text-xs text-slate-500">Link clicks so far: {clicksByIdea[r.idea_id] ?? 0}</span></div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-7">
                  {nums.map((k) => <label key={k} className="text-xs text-slate-600">{label[k]}<input name={k} type="number" min="0" defaultValue={0} className={inputCls} /></label>)}
                </div>
                <textarea name="note" rows={2} placeholder="Standout comments, questions people asked, what you noticed" className={`${inputCls} mt-2`} />
                <button className={`${submitCls} mt-2`}>Save numbers</button>
              </form>))}
          </div>
        </Card>)}

      <Card title="By platform" className="mb-4">
        <div className="overflow-x-auto"><table className="w-full"><thead><tr>{['Platform', 'Posts', 'Reach', 'Reactions', 'Comments', 'Shares', 'Saves', 'Replies', 'Followers', 'Rate'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead><tbody>
          {PLATFORMS.map((p) => { const l = rows.filter((r: any) => r.platform === p.key); return (
            <tr key={p.key}><td className={td}><b>{p.label}</b></td><td className={td}>{l.length}</td><td className={td}>{sum(l, 'reach')}</td><td className={td}>{sum(l, 'reactions')}</td><td className={td}>{sum(l, 'comments')}</td><td className={td}>{sum(l, 'shares')}</td><td className={td}>{sum(l, 'saves')}</td><td className={td}>{sum(l, 'replies')}</td><td className={td}>{sum(l, 'followers_gained')}</td><td className={td}>{rate(l.reduce((a: number, r: any) => a + eng(r), 0), sum(l, 'reach'))}</td></tr>); })}
        </tbody></table></div>
      </Card>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        {[['By angle', group('angle').map((g) => ({ ...g, name: angleLabel(g.name) }))], ['By pillar', group('pillar')]].map(([title, g]: any) => (
          <Card key={title} title={title}>
            {g.length === 0 ? <p className="text-sm text-slate-500">No posts recorded yet.</p> : (
              <table className="w-full"><thead><tr>{['', 'Posts', 'Comments', 'Rate'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead><tbody>
                {g.map((x: any) => <tr key={x.name}><td className={td}><b>{x.name}</b></td><td className={td}>{x.list.length}</td><td className={td}>{x.comments}</td><td className={td}>{rate(x.e, x.reach)}</td></tr>)}
              </tbody></table>)}
          </Card>))}
      </div>

      <Card title="Top posts by engagement" className="mb-4">
        {top.length === 0 ? <p className="text-sm text-slate-500">Appears once you have saved numbers with some reach.</p> : (
          <ol className="space-y-2 text-sm">{top.map((r: any) => <li key={r.id}><b>{r.title}</b> <span className="text-slate-500">· {PLATFORMS.find((p) => p.key === r.platform)?.label} · {angleLabel(r.angle)} · {rate(eng(r), n(r.reach))} · {n(r.comments)} comments</span>{r.note && <div className="text-xs text-slate-600">{r.note}</div>}</li>)}</ol>)}
      </Card>

      <Card title="Tracked links">
        {links.length === 0 ? <p className="text-sm text-slate-500">None yet. Make them on the Social calendar so clicks are counted.</p> : (
          <table className="w-full"><thead><tr>{['Post', 'Platform', 'Code', 'People', 'Bots/previews'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead><tbody>
            {links.map((l: any) => <tr key={l.code}><td className={td}>{l.title}</td><td className={td}>{PLATFORMS.find((p) => p.key === l.platform)?.label}</td><td className={td}>/go/{l.code}</td><td className={td}><b>{l.human}</b></td><td className={td}>{l.bots}</td></tr>)}
          </tbody></table>)}
      </Card>
    </>
  );
}
