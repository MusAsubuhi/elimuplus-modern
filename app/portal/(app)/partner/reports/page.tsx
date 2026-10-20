import { asUser } from '@/lib/db';
import { requirePartner } from '@/lib/session';
import { prepareReport, readParams } from '@/lib/org-report-run';
import { REPORT_SECTIONS, hasData, takeaways } from '@/lib/org-report';
import { Badge, Card, PageHeader, Stat, Table, inputCls, submitCls } from '@/components/ui';
import { BarCard } from '@/components/charts';
import { d } from '@/lib/format';
import { sendOrgReport } from '../../../partner-report-actions';

const CSV_NOTE = 'The CSV holds the same figures, one row per cohort, for your own spreadsheets or funder templates.';

export default async function OrgReports({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const me = await requirePartner();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const many = (k: string) => (Array.isArray(sp[k]) ? sp[k] : sp[k] ? [sp[k] as string] : []);
  const p = readParams(one, many);
  const r = await prepareReport(me, p);
  const history = await asUser(me.id, (q) => q('select e.*, pe.display_name by_name from report_exports e join people pe on pe.id=e.created_by order by e.created_at desc limit 15'));
  const chosen = new Set(r.chosen.map((c) => c.id));
  const t = r.model.total;
  const link = (f: string) => `/portal/partner/reports/file?f=${f}&c=${r.chosen.map((c) => c.id).join(',')}&s=${p.sections.join(',')}&t=${encodeURIComponent(p.title)}&n=${encodeURIComponent(p.note)}`;
  const names = r.model.rows.map((x) => x.name);
  const ser = (k: keyof (typeof r.model.rows)[number]) => r.model.rows.map((x) => (x[k] as number | null) ?? 0);

  return (
    <>
      <PageHeader image="/images/partner-process-meeting.jpg" title="Build a report" subtitle="Choose the cohorts and the parts that matter to your reader, compare them side by side, then download a PDF or send it. Figures are aggregates; no participant is named." />

      <Card title="1. What to include" className="mb-4">
        <form className="grid gap-4 text-sm lg:grid-cols-3">
          <fieldset><legend className="mb-1 font-bold">Cohorts to compare</legend>
            <div className="space-y-1">{r.all.map((c) => (
              <label key={c.id} className="flex items-center gap-2"><input type="checkbox" name="c" value={c.id} defaultChecked={!p.cohorts.length || chosen.has(c.id)} /> {c.name} <span className="text-xs text-slate-500">({d(c.start)})</span></label>))}
              {!r.all.length && <p className="text-xs text-slate-500">No cohorts yet.</p>}</div></fieldset>
          <fieldset><legend className="mb-1 font-bold">Parts of the report</legend>
            <div className="space-y-1">{REPORT_SECTIONS.map((s) => (
              <label key={s.key} className="flex items-start gap-2"><input className="mt-1" type="checkbox" name="s" value={s.key} defaultChecked={p.sections.includes(s.key)} /><span><b>{s.label}</b><br /><span className="text-xs text-slate-500">{s.blurb}</span></span></label>))}</div></fieldset>
          <div className="space-y-2">
            <label className="block font-bold">Title<input name="t" defaultValue={p.title} placeholder={r.title} className={`${inputCls} mt-1 font-normal`} /></label>
            <label className="block font-bold">Note at the top (optional)<textarea name="n" rows={3} defaultValue={p.note} className={`${inputCls} mt-1 font-normal`} placeholder="For example: prepared for the Q4 steering committee." /></label>
            <button className={submitCls}>Update preview</button>
          </div>
        </form>
      </Card>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="People trained" value={t.enrolled} sub={`${t.completed} completed`} />
        <Stat tone="gold" label="Completion" value={t.completion != null ? `${t.completion}%` : '—'} />
        <Stat tone="green" label="Learning gain" value={t.gain != null ? `+${t.gain} pts` : '—'} sub={t.pairedN ? `${t.pairedN} people, same check twice` : 'Needs both checks'} />
        <Stat label="Trading at 90 days" value={t.stages[2].trading != null ? `${t.stages[2].trading}%` : '—'} sub={`${t.stages[2].reached} reached`} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        {REPORT_SECTIONS.filter((s) => p.sections.includes(s.key)).map((s) => (
          <Card key={s.key} title={s.label}>
            {hasData(r.model, s.key) ? (<>
              <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-slate-700">{takeaways(r.model, s.key).map((x) => <li key={x}>{x}</li>)}</ul>
              {s.key === 'reach' && <BarCard data={names.map((n, i) => ({ cohort: n, Enrolled: ser('enrolled')[i], Completed: ser('completed')[i] }))} x="cohort" bars={[{ key: 'Enrolled', label: 'Enrolled', color: '#0D3B3B' }, { key: 'Completed', label: 'Completed', color: '#D4A843' }]} height={200} />}
              {s.key === 'learning' && <BarCard data={names.map((n, i) => ({ cohort: n, Before: ser('prePct')[i], After: ser('postPct')[i] }))} x="cohort" bars={[{ key: 'Before', label: 'Before %', color: '#6A8CAF' }, { key: 'After', label: 'After %', color: '#2E8B7A' }]} height={200} />}
              {s.key === 'followup' && <BarCard data={t.stages.map((x) => ({ stage: `Day ${x.stage}`, Trading: x.trading ?? 0, Higher: x.higher ?? 0 }))} x="stage" bars={[{ key: 'Trading', label: 'Trading %', color: '#0D3B3B' }, { key: 'Higher', label: 'Income higher %', color: '#D4A843' }]} height={200} />}
              {s.key === 'youth' && <BarCard data={names.map((n, i) => ({ cohort: n, Income: ser('firstIncome')[i], CV: ser('cvReady')[i] }))} x="cohort" bars={[{ key: 'Income', label: 'First income %', color: '#0D3B3B' }, { key: 'CV', label: 'CV ready %', color: '#D4A843' }]} height={200} />}
              {s.key === 'feedback' && <BarCard data={names.map((n, i) => ({ cohort: n, Rating: ser('rating')[i] }))} x="cohort" bars={[{ key: 'Rating', label: 'Rating (of 5)', color: '#D4A843' }]} height={200} />}
            </>) : <p className="text-sm text-slate-500">No data has been recorded for this part yet.</p>}
          </Card>
        ))}
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="2. Download" subtitle={CSV_NOTE}>
          {r.chosen.length ? (
            <div className="flex flex-wrap gap-2 text-sm">
              <a href={link('pdf')} className={submitCls}>Download PDF report</a>
              <a href={link('csv')} className="rounded-lg border border-teal px-4 py-2 text-sm font-bold text-teal">Download data (CSV)</a>
            </div>) : <p className="text-sm text-slate-500">Choose at least one cohort.</p>}
        </Card>
        <Card title="3. Send it" subtitle="Emails the PDF from the Elimu+ portal. Replies go to you.">
          <form action={sendOrgReport} className="space-y-2 text-sm">
            {r.chosen.map((c) => <input key={c.id} type="hidden" name="c" value={c.id} />)}
            {p.sections.map((s) => <input key={s} type="hidden" name="s" value={s} />)}
            <input type="hidden" name="t" value={p.title} /><input type="hidden" name="n" value={p.note} />
            <label className="block font-bold">Send to (up to 10 emails, separated by commas)<input name="to" className={`${inputCls} mt-1 font-normal`} placeholder="funder@example.org, board@example.org" /></label>
            <label className="block font-bold">Message (optional)<textarea name="message" rows={2} className={`${inputCls} mt-1 font-normal`} /></label>
            <label className="flex items-start gap-2 text-xs"><input className="mt-0.5" type="checkbox" name="confirm" /> Everyone I am sending to is allowed to see these results.</label>
            <button className={submitCls} disabled={!r.chosen.length}>Send PDF</button>
          </form>
        </Card>
      </div>

      <Card title="History" subtitle="Every download and email, so it is always clear what left and to whom.">
        <Table head={['When', 'By', 'Report', 'How', 'To', 'Result']} rows={history.map((h) => [d(h.created_at), h.by_name, h.title, `${h.action === 'email' ? 'Email' : 'Download'} (${h.format.toUpperCase()})`, (h.recipients ?? []).join(', ') || '—',
          <Badge key="s" tone={h.status === 'sent' || h.status === 'downloaded' ? 'green' : 'red'}>{h.status.replace('_', ' ')}</Badge>])} empty="Nothing downloaded or sent yet." />
      </Card>
    </>
  );
}
