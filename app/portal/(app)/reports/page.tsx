import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, inputCls, submitCls } from '@/components/ui';
import { d } from '@/lib/format';
import { ALL_TEMPLATES, PHASES, levelName, phaseLabel, reportLevelOf, templateFor, type Field } from '@/lib/levels';
import { markReportSeen, submitDayReport } from '../../ops-actions';

function Input({ f }: { f: Field }) {
  const label = <span className="font-bold">{f.label}{f.required ? '' : <span className="ml-1 font-normal text-slate-400">(optional)</span>}</span>;
  const help = f.help ? <span className="mt-0.5 block text-xs text-slate-500">{f.help}</span> : null;
  if (f.type === 'longtext') return <label className="block text-sm">{label}{help}<textarea name={f.key} rows={3} className={inputCls} /></label>;
  if (f.type === 'number') return <label className="block text-sm">{label}{help}<input name={f.key} type="number" min="0" inputMode="numeric" className={inputCls} /></label>;
  if (f.type === 'text') return <label className="block text-sm">{label}{help}<input name={f.key} className={inputCls} /></label>;
  if (f.type === 'choice') return (
    <fieldset className="text-sm"><legend>{label}</legend>{help}
      <div className="mt-1 flex flex-wrap gap-2">{f.options!.map((o) => (
        <label key={o} className="flex cursor-pointer items-center gap-2 rounded-lg border border-teal-100 bg-white px-3 py-1.5"><input type="radio" name={f.key} value={o} />{o}</label>))}</div></fieldset>);
  const steps = Array.from({ length: (f.max ?? 5) - (f.min ?? 1) + 1 }, (_, i) => (f.min ?? 1) + i);
  return (
    <fieldset className="text-sm"><legend>{label}</legend>{help}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {f.minLabel && <span className="text-xs text-slate-500">{f.minLabel}</span>}
        {steps.map((n) => <label key={n} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-teal-100 bg-white font-bold has-[:checked]:bg-teal has-[:checked]:text-white"><input type="radio" name={f.key} value={n} className="sr-only" />{n}</label>)}
        {f.maxLabel && <span className="text-xs text-slate-500">{f.maxLabel}</span>}
      </div></fieldset>);
}

const concernTone = (c: string) => (c === 'urgent' ? 'red' : c === 'watch' ? 'gold' : 'green');

export default async function Reports({ searchParams }: { searchParams: Promise<{ show?: string; cohort?: string }> }) {
  const me = await requireMe('facilitator', 'founder');
  const { show = 'new', cohort: pre } = await searchParams;
  const level = me.roles.includes('founder') && me.tier === 0 ? 3 : reportLevelOf(me.tier);
  const tpl = templateFor(level);
  const reviewer = me.roles.includes('founder') || me.roles.includes('master');
  const { cohorts, mine, queue, supervised } = await asUser(me.id, async (q) => ({
    cohorts: await q("select id, name, status from cohorts where status in ('confirmed','delivering','followup') order by start_date desc nulls last"),
    mine: await q(`select r.*, c.name cohort_name from day_reports r left join cohorts c on c.id=r.cohort_id where r.author_id=$1 order by r.created_at desc limit 20`, [me.id]),
    queue: await q(
      `select r.*, c.name cohort_name, coalesce(a.display_name, r.form_respondent) author, rt.display_name routed_name
       from day_reports r left join cohorts c on c.id=r.cohort_id left join people a on a.id=r.author_id left join people rt on rt.id=r.routed_to
       where r.author_id is distinct from $1
       order by case r.status when 'submitted' then 0 else 1 end, case r.concern when 'urgent' then 0 when 'watch' then 1 else 2 end, r.created_at desc limit 60`, [me.id]),
    supervised: await q(`select p.display_name from supervision s join people p on p.id=s.person_id where s.supervisor_id=$1 and s.status='active'`, [me.id]),
  }));
  const sup = (await asUser(me.id, (q) => q("select p.display_name from supervision s join people p on p.id=s.supervisor_id where s.person_id=$1 and s.status='active'", [me.id])))[0]?.display_name;
  const waiting = queue.filter((r) => r.status === 'submitted').length;
  const tab = (k: string, label: string) => (
    <a href={`/portal/reports?show=${k}`} className={`rounded-lg px-4 py-2 text-sm font-bold ${show === k ? 'bg-teal text-white' : 'bg-white text-teal border border-teal-100'}`}>{label}</a>);
  return (
    <>
      <PageHeader image="/images/trainer-coaching.jpg" title="Day reports" subtitle={`You file the ${tpl.short.toLowerCase()} report. ${tpl.depth}`} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Your level" value={levelName(me.roles.includes('founder') && me.tier === 0 ? 3 : me.tier)} sub={`Report depth: ${tpl.short}`} />
        <Stat label="Your reports go to" value={sup ?? (level >= 2 ? 'A master trainer and founders' : 'Not assigned yet')} sub={tpl.goes_to} tone={sup || level >= 2 ? 'teal' : 'red'} />
        {reviewer || supervised.length ? <Stat label="Waiting to be seen" value={waiting} tone={waiting ? 'gold' : 'green'} sub={supervised.length ? `You supervise ${supervised.map((x) => x.display_name).join(', ')}` : undefined} /> : <Stat label="Reports filed" value={mine.length} tone="gold" />}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">{tab('new', 'Write a report')}{(reviewer || supervised.length > 0 || queue.length > 0) && tab('queue', `Reports to read${waiting ? ` (${waiting})` : ''}`)}{tab('mine', 'My reports')}</div>

      {show === 'new' && (
        <Card title={`${tpl.name} report`} subtitle="Takes about five minutes. Write what you saw, not what you think we want to hear.">
          <form action={submitDayReport} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm font-bold">Cohort<select name="cohort" defaultValue={pre ?? ''} required className={inputCls}><option value="">Choose…</option>{cohorts.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}</select></label>
              <label className="block text-sm font-bold">This report is about<select name="phase" className={inputCls}>{PHASES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label className="block text-sm font-bold">Date<input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputCls} /></label>
            </div>
            {tpl.fields.map((f) => <Input key={f.key} f={f} />)}
            <button className={submitCls}>Send report</button>
          </form>
        </Card>
      )}

      {show === 'queue' && (
        <div className="space-y-3">
          {queue.length === 0 && <Card><p className="text-sm text-slate-600">No reports to read yet.</p></Card>}
          {queue.map((r) => {
            const t = ALL_TEMPLATES[String(r.level)];
            const labels = Object.fromEntries(t.fields.map((f) => [f.key, f.label]));
            return (
              <Card key={r.id} className={r.concern === 'urgent' ? 'border-[#C8553D]' : ''}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <b className="text-teal">{r.author}</b> <span className="text-sm text-slate-500">· {levelName(r.level)} · {r.kind === 'qa' ? 'QA visit' : 'day report'}{r.source === 'google_form' ? ' · from Google Form' : ''}</span>
                    <div className="text-xs text-slate-500">{r.cohort_name ?? 'No cohort matched'} · {phaseLabel(r.phase)}{r.day_number ? ` · day ${r.day_number}` : ''} · {d(r.report_date)}{r.headcount != null ? ` · ${r.headcount} present` : ''}{r.routed_name ? ` · sent to ${r.routed_name}` : ''}</div>
                  </div>
                  <div className="flex gap-1"><Badge tone={concernTone(r.concern)}>{r.concern === 'none' ? 'no concern' : r.concern}</Badge><Badge tone={r.status === 'submitted' ? 'gold' : 'green'}>{r.status}</Badge></div>
                </div>
                {r.concern_note && <p className="mt-2 rounded-lg bg-gold-100 p-2 text-sm">{r.concern_note}</p>}
                <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  {Object.entries(r.answers as Record<string, any>).filter(([k]) => !k.startsWith('_')).map(([k, v]) => (
                    <div key={k}><dt className="text-xs font-bold text-slate-500">{labels[k] ?? k}</dt><dd className="whitespace-pre-wrap text-slate-800">{String(v)}</dd></div>))}
                </dl>
                {r.review_note && <p className="mt-2 text-xs text-slate-600">Reviewer note: {r.review_note}</p>}
                {r.status !== 'actioned' && (
                  <form action={markReportSeen} className="mt-3 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="report" value={r.id} />
                    <input name="note" placeholder="Note back (optional)" className={`${inputCls} max-w-xs`} />
                    {r.status === 'submitted' && <button name="status" value="seen" className="rounded-lg border border-teal px-3 py-1.5 text-xs font-bold text-teal">Mark seen</button>}
                    <button name="status" value="actioned" className={submitCls}>Actioned</button>
                  </form>)}
              </Card>);
          })}
        </div>
      )}

      {show === 'mine' && (
        <Card title="Reports I have filed">
          {mine.length === 0 ? <p className="text-sm text-slate-600">None yet.</p> : (
            <ul className="divide-y divide-teal-50 text-sm">{mine.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><b>{r.cohort_name ?? 'No cohort'}</b> · {phaseLabel(r.phase)}{r.day_number ? ` · day ${r.day_number}` : ''} · {d(r.report_date)}</span>
                <span className="flex gap-1"><Badge tone={concernTone(r.concern)}>{r.concern}</Badge><Badge tone={r.status === 'submitted' ? 'gold' : 'green'}>{r.status === 'submitted' ? 'not yet seen' : r.status}</Badge></span>
              </li>))}</ul>)}
        </Card>
      )}
    </>
  );
}
