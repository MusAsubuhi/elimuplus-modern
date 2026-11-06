import Link from 'next/link';
import { asAdmin } from '@/lib/db';
import { requireFeature, featureLevel } from '@/lib/access';
import { Badge, Card, PageHeader, Stat, Table, inputCls, submitCls } from '@/components/ui';
import { d } from '@/lib/format';
import { todayEAT } from '@/lib/ops';
import { addIncident, addTask, closeIncident, completeTask } from '../../biz-actions';

const lbl = 'block text-xs font-bold text-slate-600';
export default async function Operations({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams; const me = await requireFeature('operations');
  const canEdit = (await featureLevel(me, 'operations')) === 'edit'; const today = todayEAT();
  const view = sp.view === 'incidents' ? 'incidents' : 'tasks';
  const X = await asAdmin(async (q) => ({
    tasks: await q(`select *, due_on::text due from ops_tasks where status='open' order by due_on nulls last, created_at`),
    done: await q(`select title, done_on::text dn from ops_tasks where status='done' order by done_on desc, created_at desc limit 8`),
    inc: await q(`select i.*, i.occurred_on::text oc, c.name cohort from incidents i left join cohorts c on c.id=i.cohort_id order by (i.status='open') desc, i.occurred_on desc limit 60`),
    cohorts: await q(`select c.id, c.name from cohorts c join organisations o on o.id=c.organisation_id where not o.is_internal order by c.seq desc limit 30`),
  }));
  const tab = (k: string, t: string) => <Link key={k} href={`/portal/operations?view=${k}`} className={`rounded-full px-4 py-1.5 text-sm font-bold ${view === k ? 'bg-teal text-white' : 'border border-teal-100 bg-white text-teal'}`}>{t}</Link>;
  return (
    <>
      {!canEdit && <div className="mb-4 rounded-xl border border-gold bg-gold-100 p-3 text-sm font-bold text-teal">You can look at this page but not change it. Ask a founder if you need to edit.</div>}
      <fieldset disabled={!canEdit} className="contents">
      <PageHeader image="/images/hero-bg.jpg" title="Operations and admin" subtitle="The routine jobs that keep Elimu+ running, with repeats, and a register of anything that went wrong." />
      <div className="mb-4 grid gap-4 sm:grid-cols-3"><Stat label="Open tasks" value={X.tasks.length} /><Stat tone="red" label="Due or overdue" value={X.tasks.filter((t: any) => t.due && t.due <= today).length} /><Stat tone="gold" label="Open incidents" value={X.inc.filter((i: any) => i.status === 'open').length} /></div>
      <div className="mb-5 flex gap-2">{tab('tasks', 'Tasks and routines')}{tab('incidents', 'Incidents')}</div>
      {view === 'tasks' && (
        <div className="space-y-5">
          <Card title="Open" subtitle="Finishing a repeating task schedules the next one.">
            <Table head={['Task', 'Owner', 'Due', 'Repeats', '']}
              rows={X.tasks.map((t: any) => [<div key="t"><b>{t.title}</b>{t.detail && <div className="text-xs text-slate-500">{t.detail}</div>}</div>, t.owner_name ?? '', t.due ? <span key="d" className={t.due <= today ? 'font-bold text-red-700' : ''}>{d(t.due)}</span> : '', t.recurrence === 'none' ? '' : t.recurrence,
                <form key="f" action={completeTask}><input type="hidden" name="id" value={t.id} /><button className="rounded bg-teal px-2 py-1 text-xs font-bold text-white">Done</button></form>])} empty="Nothing open." />
            {X.done.length > 0 && <p className="mt-3 text-xs text-slate-500">Recently done: {X.done.map((t: any) => `${t.title} (${d(t.dn)})`).join(' · ')}</p>}
          </Card>
          <Card title="Add a task or routine" subtitle="For example: reconcile M-Pesa weekly, back up the portal monthly, review social calendar.">
            <form action={addTask} className="grid gap-3 sm:grid-cols-4">
              <label className={`${lbl} sm:col-span-2`}>Task<input name="title" required className={inputCls} /></label><label className={lbl}>Who<input name="owner_name" className={inputCls} /></label><label className={lbl}>Due<input type="date" name="due_on" className={inputCls} /></label>
              <label className={lbl}>Repeats<select name="recurrence" className={inputCls}>{['none', 'weekly', 'monthly', 'quarterly', 'yearly'].map((r) => <option key={r}>{r}</option>)}</select></label><label className={`${lbl} sm:col-span-3`}>Detail<input name="detail" className={inputCls} /></label>
              <div className="sm:col-span-4"><button className={submitCls}>Add task</button></div>
            </form>
          </Card>
        </div>
      )}
      {view === 'incidents' && (
        <div className="space-y-5">
          <Card title="Incident register" subtitle="Safety, safeguarding, equipment, data and complaints. Name only what is needed; keep details of children out of this text and in the safeguarding record.">
            <Table head={['Date', 'Kind', 'Severity', 'What happened', 'Action', 'Status']}
              rows={X.inc.map((i: any) => [d(i.oc), i.kind, <Badge key="s" tone={i.severity === 'high' ? 'red' : i.severity === 'medium' ? 'gold' : 'grey'}>{i.severity}</Badge>, <div key="w">{i.description}{i.cohort && <div className="text-xs text-slate-500">{i.cohort}</div>}</div>,
                i.status === 'open' ? <form key="a" action={closeIncident} className="flex gap-1"><input type="hidden" name="id" value={i.id} /><input name="action_taken" defaultValue={i.action_taken ?? ''} placeholder="What was done" className="w-36 rounded border border-teal-100 px-1 py-0.5 text-xs" /><button className="text-xs font-bold text-teal underline">Close</button></form> : i.action_taken ?? '',
                <Badge key="st" tone={i.status === 'open' ? 'red' : 'green'}>{i.status}</Badge>])} empty="No incidents recorded." />
          </Card>
          <Card title="Record an incident">
            <form action={addIncident} className="grid gap-3 sm:grid-cols-4">
              <label className={lbl}>Date<input type="date" name="occurred_on" defaultValue={today} className={inputCls} /></label>
              <label className={lbl}>Kind<select name="kind" className={inputCls}>{['safety', 'safeguarding', 'equipment', 'data', 'complaint', 'conduct', 'other'].map((k) => <option key={k}>{k}</option>)}</select></label>
              <label className={lbl}>Severity<select name="severity" className={inputCls}>{['low', 'medium', 'high'].map((k) => <option key={k}>{k}</option>)}</select></label>
              <label className={lbl}>Cohort<select name="cohort_id" className={inputCls}><option value="">None</option>{X.cohorts.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className={`${lbl} sm:col-span-2`}>What happened<input name="description" required className={inputCls} /></label><label className={`${lbl} sm:col-span-2`}>Action taken so far<input name="action_taken" className={inputCls} /></label>
              <div className="sm:col-span-4"><button className={submitCls}>Record</button></div>
            </form>
          </Card>
        </div>
      )}
      </fieldset>
    </>
  );
}
