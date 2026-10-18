import { asAdmin } from '@/lib/db';
import { requireFeature, featureLevel } from '@/lib/access';
import { Badge, Card, PageHeader, inputCls, submitCls , ViewOnly } from '@/components/ui';
import { PLATFORMS, angleLabel } from '@/lib/social';
import { createLink, recordPosted } from '../../../social-actions';

export const dynamic = 'force-dynamic';
const ghost = 'rounded-lg border border-teal px-3 py-1.5 text-xs font-bold text-teal';
const day = (d: any) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const iso = (d: any) => new Date(d).toISOString().slice(0, 10);

export default async function Calendar() {
  const me = await requireFeature('social_publish');
  const view = (await featureLevel(me, 'social_publish')) !== 'edit';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const { ideas, posts, links } = await asAdmin(async (q) => ({
    ideas: await q(`select i.*, p.full_name author from social_ideas i left join people p on p.id=i.author_id
                    where i.scheduled_for is not null and i.scheduled_for between ($1::date - 14) and ($1::date + 21)
                    order by i.scheduled_for, i.created_at`, [today]),
    posts: await q('select * from social_posts'),
    links: await q(`select l.code, l.idea_id, l.platform, l.target_url, count(c.id) filter (where not c.is_bot)::int clicks
                    from social_links l left join social_clicks c on c.code=l.code group by l.code`),
  }));
  const unscheduled = (await asAdmin((q) => q(`select count(*)::int n from social_ideas where status='approved' and scheduled_for is null`)))[0].n;
  const base = (process.env.PORTAL_URL || 'https://portal.elimuplus.com').replace(/\/$/, '');
  const credit = (i: any) => [`Idea by ${String(i.author ?? 'the Elimu+ team').split(' ')[0]}, Elimu+`, i.partner_name ? `In partnership with ${i.partner_name}` : ''].filter(Boolean).join(' · ');
  const todays = ideas.filter((i: any) => iso(i.scheduled_for) === today);
  const upcoming = ideas.filter((i: any) => iso(i.scheduled_for) > today);
  const past = ideas.filter((i: any) => iso(i.scheduled_for) < today).reverse();

  const card = (i: any, open = false) => {
    const d = i.drafts ?? {};
    const mine = posts.filter((p: any) => p.idea_id === i.id);
    const myLinks = links.filter((l: any) => l.idea_id === i.id);
    const ready = i.status === 'approved' || i.status === 'posted';
    return (
      <Card key={i.id} title={i.title} className="mb-4" action={<div className="flex gap-2"><Badge tone="grey">{angleLabel(i.angle)}</Badge><Badge tone={ready ? 'green' : 'gold'}>{ready ? (i.status === 'posted' ? 'Posting' : 'Approved') : 'Not approved yet'}</Badge></div>}>
        <p className="text-xs text-slate-500">{day(i.scheduled_for)}{i.pillar ? ` · ${i.pillar}` : ''} · Credit: {credit(i)}</p>
        {!ready && <p className="mt-2 rounded-lg bg-[#FFF8E6] p-2 text-sm text-slate-700">This post is not approved by both founders yet, so it cannot be marked as posted. Approve it on the Social ideas page.</p>}
        <details open={open} className="mt-3">
          <summary className="cursor-pointer text-sm font-bold text-teal">Platform versions and posting</summary>
          <div className="mt-3 space-y-4">
            {PLATFORMS.map((p) => {
              const done = mine.find((m: any) => m.platform === p.key);
              const link = myLinks.find((l: any) => l.platform === p.key);
              return (
                <div key={p.key} className="rounded-lg border border-teal-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm text-teal">{p.label}</b>{done ? <Badge tone="green">Posted {new Date(done.posted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' })}</Badge> : <Badge tone="grey">Not posted</Badge>}</div>
                  <textarea readOnly rows={4} value={d[p.key] ? `${d[p.key]}\n\n${credit(i)}${link ? `\n${base}/go/${link.code}` : ''}` : '(no version written for this platform yet)'} className={`${inputCls} mt-2 bg-[#F5FAF8]`} />
                  {i.image_url && <p className="mt-1 text-xs text-slate-500">Picture: {i.image_url}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {link ? <span className="text-xs text-slate-600">Tracked link: <b>{base}/go/{link.code}</b> ({link.clicks} clicks)</span> : (
                      <form action={createLink} className="flex flex-wrap gap-2"><input type="hidden" name="id" value={i.id} /><input type="hidden" name="platform" value={p.key} />
                        <input name="target" defaultValue="https://elimuplus.com" className={`${inputCls} w-64`} /><button className={ghost}>Make tracked link</button></form>)}
                  </div>
                  {ready && !done && (
                    <form action={recordPosted} className="mt-2 flex flex-wrap gap-2"><input type="hidden" name="id" value={i.id} /><input type="hidden" name="platform" value={p.key} />
                      <input name="post_url" placeholder="Address of the post (optional, https://)" className={`${inputCls} w-72`} /><button className={submitCls}>I posted it here</button></form>)}
                </div>
              );
            })}
          </div>
        </details>
      </Card>
    );
  };

  return (
    <>
      <PageHeader title="Social calendar and posting" subtitle="What goes out today and in the coming weeks. Copy each version, post it on the platform, then record it here." />
      <ViewOnly view={view}>
      {unscheduled > 0 && <p className="mb-4 rounded-lg bg-[#FFF8E6] p-3 text-sm">{unscheduled} approved post{unscheduled === 1 ? ' has' : 's have'} no date yet. Give {unscheduled === 1 ? 'it' : 'them'} a date on the Social ideas page.</p>}
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gold">Today, {day(today)}</h2>
      {todays.length === 0 ? <p className="mb-6 text-sm text-slate-500">Nothing scheduled for today.</p> : todays.map((i: any) => card(i, true))}
      <h2 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-gold">Coming up (next three weeks)</h2>
      {upcoming.length === 0 ? <p className="mb-6 text-sm text-slate-500">Nothing scheduled.</p> : upcoming.map((i: any) => card(i))}
      <h2 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-gold">Last two weeks</h2>
      {past.length === 0 ? <p className="text-sm text-slate-500">Nothing yet.</p> : past.map((i: any) => card(i))}
      </ViewOnly>
    </>
  );
}
