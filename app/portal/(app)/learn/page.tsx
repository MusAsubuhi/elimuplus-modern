import Link from 'next/link';
import { asAdmin, asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, inputCls, submitCls } from '@/components/ui';
import LearningAdder from '@/components/learning-adder';
import { AUDIENCES, KIND_LABEL, TOPICS, type Resource } from '@/lib/learning';
import { d, daysFromToday, iso } from '@/lib/format';
import { deleteResource, updateResource } from '../../learn-actions';

const ICON: Record<string, string> = { pdf: '▤', link: '↗', video: '▶' };

function Row({ r, done, isFounder, stats }: { r: Resource; done: boolean; isFounder: boolean; stats?: { done: number; total: number; pending: string[] } }) {
  const due = r.due_on ? daysFromToday(r.due_on) : null;
  return (
    <li className="rounded-lg border border-teal-100 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link href={`/portal/learn/${r.id}`} className="flex min-w-0 flex-1 items-start gap-3 hover:opacity-90">
          <span className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-lg bg-teal text-white">{ICON[r.kind]}</span>
          <span className="min-w-0">
            <b className="block text-teal">{r.title}</b>
            {r.description && <span className="block text-sm text-slate-600">{r.description}</span>}
            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
              <Badge tone="grey">{KIND_LABEL[r.kind]}</Badge>
              <Badge tone="blue">{TOPICS[r.topic] ?? r.topic}</Badge>
              {r.required && <Badge tone="gold">Required</Badge>}
              {r.status !== 'published' && <Badge tone="red">{r.status}</Badge>}
              {r.required && r.due_on && !done && <span className={due !== null && due < 0 ? 'font-bold text-red-700' : 'text-slate-500'}>{due !== null && due < 0 ? 'was due' : 'finish by'} {d(r.due_on)}</span>}
            </span>
          </span>
        </Link>
        <span className="flex-none">{done ? <Badge tone="green">Done ✓</Badge> : <Link href={`/portal/learn/${r.id}`} className="rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-teal">{r.kind === 'pdf' ? 'Read' : 'Open'}</Link>}</span>
      </div>
      {isFounder && (
        <details className="mt-3 border-t border-teal-50 pt-2">
          <summary className="cursor-pointer text-xs font-bold text-teal">
            Manage{stats ? ` · ${stats.done} of ${stats.total} have finished it` : ''}
          </summary>
          {stats && stats.pending.length > 0 && <p className="mt-2 text-xs text-slate-600"><b>Not yet:</b> {stats.pending.join(', ')}{stats.total - stats.done > stats.pending.length ? ` and ${stats.total - stats.done - stats.pending.length} more` : ''}</p>}
          <form action={updateResource} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="id" value={r.id} />
            <label className="sm:col-span-2 text-xs font-bold text-slate-600">Title<input name="title" defaultValue={r.title} className={inputCls} /></label>
            <label className="sm:col-span-2 text-xs font-bold text-slate-600">Description<textarea name="description" defaultValue={r.description ?? ''} rows={2} className={inputCls} /></label>
            <label className="text-xs font-bold text-slate-600">Topic<select name="topic" defaultValue={r.topic} className={inputCls}>{Object.entries(TOPICS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="text-xs font-bold text-slate-600">Status<select name="status" defaultValue={r.status} className={inputCls}><option value="published">Published</option><option value="draft">Draft (founders only)</option><option value="archived">Archived</option></select></label>
            <fieldset className="sm:col-span-2 flex flex-wrap gap-x-5 gap-y-1 text-sm"><legend className="text-xs font-bold text-slate-600">For</legend>
              {Object.entries(AUDIENCES).map(([k, v]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" name="audience" value={k} defaultChecked={r.audience.includes(k)} />{v}</label>)}</fieldset>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="required" defaultChecked={r.required} /> Required</label>
            <label className="text-xs font-bold text-slate-600">Finish by<input type="date" name="due_on" defaultValue={r.due_on ? iso(r.due_on) : ''} className={inputCls} /></label>
            <div className="sm:col-span-2 flex gap-2"><button className={submitCls}>Save changes</button></div>
          </form>
          {r.status === 'archived' && (
            <form action={deleteResource} className="mt-2"><input type="hidden" name="id" value={r.id} />
              <button className="text-xs font-bold text-red-700 underline">Remove for good (also removes the file and everyone&rsquo;s completion)</button></form>
          )}
        </details>
      )}
    </li>
  );
}

export default async function Learn({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const me = await requireMe();
  const sp = await searchParams;
  const isFounder = me.roles.includes('founder');
  const topic = sp.topic && sp.topic in TOPICS ? sp.topic : '';
  const [all, mine] = await asUser(me.id, async (q) => [
    (await q('select * from learning_resources order by required desc, sort_order, title')) as Resource[],
    (await q('select resource_id from learning_completions where person_id=$1', [me.id])) as { resource_id: string }[],
  ]);
  const done = new Set(mine.map((m) => m.resource_id));
  const live = all.filter((r) => r.status === 'published');
  const needed = live.filter((r) => r.required && !done.has(r.id));
  const shown = live.filter((r) => !topic || r.topic === topic);
  const topicsUsed = [...new Set(live.map((r) => r.topic))];

  // founders: who has finished what, among the people each item is for
  const stats = new Map<string, { done: number; total: number; pending: string[] }>();
  if (isFounder && all.length) {
    const rows = await asAdmin((q) => q(
      `select r.id rid, p.id pid, p.display_name name, exists(select 1 from learning_completions c where c.resource_id=r.id and c.person_id=p.id) done
       from learning_resources r join people p on exists (select 1 from role_assignments ra where ra.person_id=p.id and ra.status='active' and (ra.end_date is null or ra.end_date >= current_date) and (
         ('facilitator' = any(r.audience) and ra.role='facilitator') or ('master' = any(r.audience) and ra.role='facilitator' and ra.tier >= 3)
         or ('participant' = any(r.audience) and ra.role='participant') or ('org_admin' = any(r.audience) and ra.role in ('org_admin','org_viewer'))))
       where r.status='published' order by p.display_name`));
    for (const row of rows) {
      const s = stats.get(row.rid) ?? { done: 0, total: 0, pending: [] };
      const seen = (s as any)._seen ?? ((s as any)._seen = new Set<string>());
      if (seen.has(row.pid)) continue; seen.add(row.pid);
      s.total++; if (row.done) s.done++; else if (s.pending.length < 25) s.pending.push(row.name);
      stats.set(row.rid, s);
    }
  }
  const requiredLive = live.filter((r) => r.required);
  const fullyDone = requiredLive.filter((r) => { const s = stats.get(r.id); return s && s.total > 0 && s.done === s.total; }).length;

  return (
    <div>
      <PageHeader image="/images/partner-process-meeting.jpg" title="Learning center" subtitle="Guides, documents and videos for the people we work with. Read them here; some are marked required." />
      {!isFounder && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Stat label="For you" value={live.length} sub="documents and links" />
          <Stat label="Required, still to do" value={needed.length} tone={needed.length ? 'gold' : 'green'} sub={needed.length ? 'Start with these' : 'All up to date'} />
          <Stat label="Finished" value={live.filter((r) => done.has(r.id)).length} tone="green" />
        </div>
      )}
      {isFounder && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Stat label="In the library" value={live.length} sub={`${all.length - live.length} draft or archived`} />
          <Stat label="Required items" value={requiredLive.length} tone="gold" sub={`${fullyDone} finished by everyone they are for`} />
          <Stat label="Finished by you" value={live.filter((r) => done.has(r.id)).length} tone="green" />
        </div>
      )}

      {needed.length > 0 && (
        <Card className="mb-5" title="Required for you" subtitle="Please finish these. They are marked required by the founders.">
          <ul className="space-y-2">{needed.map((r) => <Row key={r.id} r={r} done={false} isFounder={false} />)}</ul>
        </Card>
      )}

      {isFounder && (
        <Card className="mb-5" title="Add to the library" subtitle="Add a PDF or a link at any time. People see it straight away if it is published for their group.">
          <LearningAdder topics={TOPICS} audiences={AUDIENCES} />
        </Card>
      )}

      <Card title={topic ? `Library: ${TOPICS[topic]}` : 'Library'}
        action={topicsUsed.length > 1 ? (
          <div className="flex flex-wrap justify-end gap-1 text-xs">
            <Link href="/portal/learn" className={`rounded-full px-2.5 py-1 font-bold ${!topic ? 'bg-teal text-white' : 'bg-teal-50 text-teal'}`}>All</Link>
            {topicsUsed.map((t) => <Link key={t} href={`/portal/learn?topic=${t}`} className={`rounded-full px-2.5 py-1 font-bold ${topic === t ? 'bg-teal text-white' : 'bg-teal-50 text-teal'}`}>{TOPICS[t] ?? t}</Link>)}
          </div>) : undefined}>
        {shown.length
          ? <ul className="space-y-2">{shown.map((r) => <Row key={r.id} r={r} done={done.has(r.id)} isFounder={isFounder} stats={stats.get(r.id)} />)}</ul>
          : <p className="text-sm text-slate-500">{isFounder ? 'Nothing published yet. Add the first document or link above.' : 'Nothing has been shared with you yet. Please check again soon.'}</p>}
      </Card>

      {isFounder && all.some((r) => r.status !== 'published') && (
        <Card className="mt-5" title="Drafts and archived" subtitle="Only founders can see these.">
          <ul className="space-y-2">{all.filter((r) => r.status !== 'published').map((r) => <Row key={r.id} r={r} done={done.has(r.id)} isFounder stats={undefined} />)}</ul>
        </Card>
      )}
    </div>
  );
}
