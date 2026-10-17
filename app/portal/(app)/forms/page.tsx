import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, Table, statusTone } from '@/components/ui';
import { d } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** What the portal has stored from each Google Form, by registry key. Only rows that arrived through a form count, not hand-entered history. */
const PORTAL_COUNT: Record<string, string> = {
  followup: `select count(*)::int n from followup_forms where response_id is not null`,
  youth_followup: `select count(*)::int n from youth_followups where response_id is not null`,
  baseline: `select count(*)::int n from baselines where response_id is not null`,
  learning: `select count(*)::int n from learning_checks where response_id is not null`,
  exit: `select count(*)::int n from exit_feedback where response_id is not null`,
};
const GROUPS: { kind: string; title: string; note: string }[] = [
  { kind: 'followup', title: 'Follow-up visits (Day 30, 60 and 90)', note: 'One adult form and one youth form. Each submission says which visit it is.' },
  { kind: 'start_end', title: 'Start and end of training', note: 'Day 0 baseline, the learning check (first and last day) and exit feedback.' },
  { kind: 'cohort', title: 'Registration, attendance and observers', note: 'Made for each cohort.' },
  { kind: 'report', title: 'Facilitator day reports', note: 'One form per facilitator level.' },
  { kind: 'other', title: 'Other', note: '' },
];
const when = (x: any) => (x ? new Date(x).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export default async function Forms() {
  const me = await requireMe('founder', 'master');
  const { forms, portal, cohorts } = await asUser(me.id, async (q) => {
    const forms = await q(`select key, title, kind, fill_url, edit_url, sheet_url, google_responses, last_response_at, checked_at from form_registry order by kind, title`);
    const portal: Record<string, number> = {};
    for (const [k, sql] of Object.entries(PORTAL_COUNT)) portal[k] = (await q(sql))[0]?.n ?? 0;
    const by = async (sql: string) => Object.fromEntries((await q(sql)).map((r: any) => [r.cohort_id, r]));
    const enrol = await by(`select cohort_id, count(*)::int n from enrolments group by cohort_id`);
    const base = await by(`select e.cohort_id, count(*)::int n from baselines b join enrolments e on e.id = b.enrolment_id group by e.cohort_id`);
    const learn = await by(`select e.cohort_id, count(*) filter (where l.stage='pre')::int pre, count(*) filter (where l.stage='post')::int post from learning_checks l join enrolments e on e.id = l.enrolment_id group by e.cohort_id`);
    const exit = await by(`select e.cohort_id, count(*)::int n from exit_feedback x join enrolments e on e.id = x.enrolment_id group by e.cohort_id`);
    const ad = await by(`select cohort_id, count(*) filter (where stage=30)::int s30, count(*) filter (where stage=60)::int s60, count(*) filter (where stage=90)::int s90 from followup_forms where cohort_id is not null group by cohort_id`);
    const yo = await by(`select cohort_id, count(*) filter (where stage=30)::int s30, count(*) filter (where stage=60)::int s60, count(*) filter (where stage=90)::int s90 from youth_followups where cohort_id is not null group by cohort_id`);
    const list = await q(`select c.id, c.name, c.status, o.name org, c.start_date from cohorts c join organisations o on o.id = c.organisation_id order by c.start_date desc nulls last limit 60`);
    const cohorts = list.map((c: any) => ({ ...c, enrolled: enrol[c.id]?.n ?? 0, base: base[c.id]?.n ?? 0, pre: learn[c.id]?.pre ?? 0, post: learn[c.id]?.post ?? 0, exit: exit[c.id]?.n ?? 0, ad: ad[c.id] ?? {}, yo: yo[c.id] ?? {} }));
    return { forms, portal, cohorts };
  });
  const missing = forms.filter((f: any) => f.google_responses != null && portal[f.key] != null && f.google_responses > portal[f.key]);
  const lastCheck = forms.reduce((m: any, f: any) => (!m || new Date(f.checked_at) > new Date(m) ? f.checked_at : m), null);
  const cell = (n: number, of?: number) => (n ? <span className="font-bold text-teal">{n}{of ? <span className="font-normal text-slate-400"> / {of}</span> : null}</span> : <span className="text-slate-300">0</span>);

  return (
    <>
      <PageHeader title="Forms and responses" subtitle="Every Google Form and its response sheet in one place, and what the portal has received from each." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Forms" value={forms.length} sub={forms.length ? 'Links refresh every hour' : 'Waiting for the Forms script to report'} />
        <Stat tone={missing.length ? 'red' : 'green'} label="Responses not yet in the portal" value={missing.reduce((s: number, f: any) => s + (f.google_responses - portal[f.key]), 0)} sub={missing.length ? `${missing.length} form${missing.length > 1 ? 's' : ''} behind` : 'Google and the portal agree'} />
        <Stat tone="gold" label="Last checked" value={lastCheck ? when(lastCheck) : '—'} sub="Time of the last report from Google" />
      </div>

      {!forms.length && (
        <Card title="No forms listed yet"><p className="text-sm text-slate-600">The Forms script has not reported its links yet. In Apps Script, run <b>publishFormLinks</b> once; after that it reports every hour by itself.</p></Card>
      )}

      {GROUPS.map((g) => {
        const rows = forms.filter((f: any) => f.kind === g.kind);
        if (!rows.length) return null;
        return (
          <Card key={g.kind} className="mb-6" title={g.title} subtitle={g.note || undefined}>
            <Table head={['Form', 'Open', 'In Google', 'In the portal', 'Last response', 'Status']} rows={rows.map((f: any) => {
              const p = portal[f.key];
              const gap = f.google_responses != null && p != null ? f.google_responses - p : null;
              return [
                <span key="t" className="font-semibold text-ink">{f.title}</span>,
                <span key="l" className="flex flex-wrap gap-x-3 gap-y-1">
                  {f.fill_url && <a className="font-bold text-teal underline" href={f.fill_url} target="_blank" rel="noreferrer">Form</a>}
                  {f.sheet_url && <a className="font-bold text-teal underline" href={f.sheet_url} target="_blank" rel="noreferrer">Responses sheet</a>}
                  {f.edit_url && <a className="text-slate-500 underline" href={f.edit_url} target="_blank" rel="noreferrer">Edit</a>}
                </span>,
                f.google_responses ?? '—',
                p ?? <span className="text-slate-400">n/a</span>,
                f.last_response_at ? when(f.last_response_at) : <span className="text-slate-400">none yet</span>,
                gap == null ? <Badge key="s">Not compared</Badge> : gap > 0 ? <Badge key="s" tone="red">{gap} not in portal</Badge> : <Badge key="s" tone="green">In sync</Badge>,
              ];
            })} />
          </Card>
        );
      })}

      <Card title="Results together, by cohort" subtitle="For each cohort: who has a baseline, a learning check at the start and the end, exit feedback, and a follow-up at 30, 60 and 90 days. Open a cohort to see the answers side by side." className="mb-6">
        <Table head={['Cohort', 'Enrolled', 'Baseline', 'Learning start', 'Learning end', 'Exit', 'Adult 30', 'Adult 60', 'Adult 90', 'Youth 30', 'Youth 60', 'Youth 90']} rows={cohorts.map((c: any) => [
          <span key="n"><Link href={`/portal/cohorts/${c.id}/outcomes`} className="font-bold text-teal underline">{c.name}</Link><span className="block text-xs text-slate-500">{c.org}{c.start_date ? ` · ${d(c.start_date)}` : ''} · <Badge tone={statusTone(c.status)}>{c.status}</Badge></span></span>,
          c.enrolled, cell(c.base, c.enrolled), cell(c.pre, c.enrolled), cell(c.post, c.enrolled), cell(c.exit, c.enrolled),
          cell(c.ad.s30 ?? 0, c.enrolled), cell(c.ad.s60 ?? 0, c.enrolled), cell(c.ad.s90 ?? 0, c.enrolled),
          cell(c.yo.s30 ?? 0), cell(c.yo.s60 ?? 0), cell(c.yo.s90 ?? 0),
        ])} />
        <p className="mt-3 text-xs text-slate-500">A response is matched to a participant by the phone number registered in Elimu+. If a count looks low, check that the number on the form matches the registered one.</p>
      </Card>
    </>
  );
}
