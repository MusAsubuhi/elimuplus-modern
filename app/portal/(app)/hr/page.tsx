import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { Badge, Card, PageHeader, Stat, Table, inputCls, submitCls } from '@/components/ui';
import { d, kes } from '@/lib/format';
import { LEAVE_ENTITLEMENT } from '@/lib/payroll';
import { addCandidate, addInterview, addLeave, addOpening, cancelLeave, hireCandidate, moveCandidate, saveEmployee, setOpeningStatus } from '../../hr-actions';

const VIEWS = [['team', 'Team'], ['leave', 'Leave'], ['hiring', 'Hiring']] as const;
const DEPTS = ['Programme', 'Partnerships', 'Marketing', 'Finance and admin', 'Leadership', 'Other'];
const STAGES = ['applied', 'screened', 'interview', 'offer', 'hired', 'rejected', 'withdrew'];
const KIND_LABEL: Record<string, string> = { annual: 'Annual', sick: 'Sick', maternity: 'Maternity', paternity: 'Paternity', compassionate: 'Compassionate', unpaid: 'Unpaid', study: 'Study' };
const REC: Record<string, string> = { strong_yes: 'Strong yes', yes: 'Yes', maybe: 'Maybe', no: 'No' };
const lbl = 'block text-xs font-bold text-slate-600';

export default async function HR({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const me = await requireMe('founder');
  await audit(me.id, 'view hr', 'employees');
  const view = VIEWS.some(([k]) => k === sp.view) ? sp.view! : 'team';
  const today = new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);
  const X = await asUser(me.id, async (q) => ({
    emps: await q(`select id, full_name, job_title, department, employment_type, status, start_date::text start_date, probation_end::text probation_end, contract_end::text contract_end, (basic_kes + allowances_kes)::float8 pay, manager_id from employees order by status = 'exited', full_name`),
    leave: await q(`select l.*, e.full_name from leave_requests l join employees e on e.id=l.employee_id order by l.start_date desc limit 200`),
    taken: await q(`select employee_id, kind, sum(days)::float8 days from leave_requests where status='approved' and extract(year from start_date)=$1 group by 1,2`, [Number(year)]),
    openings: await q('select * from job_openings order by status = \'open\' desc, opened_on desc'),
    cands: await q(`select c.*, (select avg((coalesce(score_skills,0)+coalesce(score_communication,0)+coalesce(score_values,0)+coalesce(score_problem,0))::numeric / nullif((score_skills is not null)::int+(score_communication is not null)::int+(score_values is not null)::int+(score_problem is not null)::int,0)) from interviews i where i.candidate_id=c.id)::float8 avg_score,
                      (select count(*)::int from interviews i where i.candidate_id=c.id) n_int, (select recommendation from interviews i where i.candidate_id=c.id order by interview_on desc, created_at desc limit 1) last_rec from candidates c order by c.created_at desc`),
  }));
  const active = X.emps.filter((e: any) => e.status !== 'exited');
  const soon = (x: string | null, days: number) => !!x && x >= today && x <= new Date(Date.parse(today) + days * 86400000).toISOString().slice(0, 10);
  const nameOf = (id: string) => X.emps.find((e: any) => e.id === id)?.full_name ?? '';
  const sel = (name: string, opts: [string, string][], def = '') => <select name={name} defaultValue={def} className={inputCls}>{opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>;

  return (
    <>
      <PageHeader image="/images/hero-bg.jpg" title="People and HR" subtitle="Team list, leave, hiring, performance and pay for the people who work for Elimu+. Visible to founders only.">
        <Link href="/portal/payroll" className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-teal">Payroll</Link>
      </PageHeader>
      <div className="mb-5 flex flex-wrap gap-2">
        {VIEWS.map(([k, label]) => <Link key={k} href={`/portal/hr?view=${k}`} className={`rounded-full px-4 py-1.5 text-sm font-bold ${view === k ? 'bg-teal text-white' : 'border border-teal-100 bg-white text-teal'}`}>{label}</Link>)}
      </div>

      {view === 'team' && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-4">
            <Stat label="On the team" value={active.length} sub={`${X.emps.length - active.length} exited`} />
            <Stat tone="gold" label="Monthly pay bill (gross)" value={kes(active.reduce((a: number, e: any) => a + e.pay, 0))} />
            <Stat tone="red" label="Contracts ending in 60 days" value={active.filter((e: any) => soon(e.contract_end, 60)).length} />
            <Stat label="Probation ending in 30 days" value={active.filter((e: any) => soon(e.probation_end, 30)).length} />
          </div>
          <Card title="Everyone who works for Elimu+" subtitle="Trainers paid per session through payout claims are not listed here; this is for people on a contract or payroll.">
            <Table head={['Name', 'Role', 'Department', 'Type', 'Started', 'Gross pay', 'Watch', 'Status']}
              rows={X.emps.map((e: any) => [
                <Link key="n" href={`/portal/hr/${e.id}`} className="font-bold text-teal underline">{e.full_name}</Link>, e.job_title, e.department, e.employment_type, d(e.start_date), kes(e.pay),
                [soon(e.contract_end, 60) && `contract ends ${d(e.contract_end)}`, soon(e.probation_end, 30) && `probation ends ${d(e.probation_end)}`].filter(Boolean).join(', ') || '',
                <Badge key="s" tone={e.status === 'active' ? 'green' : e.status === 'exited' ? 'grey' : 'gold'}>{e.status.replace('_', ' ')}</Badge>])} empty="No one added yet. Add the first person below." />
          </Card>
          <Card title="Add a team member" subtitle="Pay is the monthly figure before tax. You can fill in tax numbers and the onboarding checklist afterwards.">
            <form action={saveEmployee} className="grid gap-3 sm:grid-cols-3">
              <label className={lbl}>Full name<input name="full_name" required className={inputCls} /></label>
              <label className={lbl}>Job title<input name="job_title" required className={inputCls} /></label>
              <label className={lbl}>Department{sel('department', DEPTS.map((x) => [x, x]))}</label>
              <label className={lbl}>Type{sel('employment_type', [['permanent', 'Permanent'], ['contract', 'Contract'], ['casual', 'Casual'], ['intern', 'Intern']], 'contract')}</label>
              <label className={lbl}>Start date<input type="date" name="start_date" required className={inputCls} /></label>
              <label className={lbl}>Reports to{sel('manager_id', [['', 'No one'], ...active.map((e: any): [string, string] => [e.id, e.full_name])])}</label>
              <label className={lbl}>Basic pay per month (KES)<input name="basic_kes" inputMode="decimal" defaultValue="0" className={inputCls} /></label>
              <label className={lbl}>Taxable allowances per month (KES)<input name="allowances_kes" inputMode="decimal" defaultValue="0" className={inputCls} /></label>
              <label className={lbl}>Phone<input name="phone" className={inputCls} /></label>
              <div className="sm:col-span-3"><button className={submitCls}>Add to the team</button></div>
            </form>
          </Card>
        </div>
      )}

      {view === 'leave' && (
        <div className="space-y-5">
          <Card title="Leave balances this year" subtitle="Guides from the Employment Act: 21 days annual leave, 14 sick days (7 full pay, 7 half pay) after two months, 14 days paternity, 90 days maternity. Your contracts can be more generous.">
            <Table head={['Person', 'Annual taken', 'Annual left', 'Sick taken', 'Other taken']}
              rows={active.map((e: any) => {
                const t = (k: string) => X.taken.find((x: any) => x.employee_id === e.id && x.kind === k)?.days ?? 0;
                const other = X.taken.filter((x: any) => x.employee_id === e.id && !['annual', 'sick'].includes(x.kind)).reduce((a: number, x: any) => a + x.days, 0);
                return [<Link key="n" href={`/portal/hr/${e.id}`} className="font-bold text-teal underline">{e.full_name}</Link>, t('annual'), Math.max(0, (LEAVE_ENTITLEMENT.annual as number) - t('annual')), t('sick'), other];
              })} empty="Add team members first." />
          </Card>
          <Card title="Record leave">
            <form action={addLeave} className="grid gap-3 sm:grid-cols-3">
              <label className={lbl}>Person{sel('employee_id', active.map((e: any): [string, string] => [e.id, e.full_name]))}</label>
              <label className={lbl}>Kind{sel('kind', Object.entries(KIND_LABEL))}</label>
              <label className={lbl}>Working days<input name="days" inputMode="decimal" required className={inputCls} /></label>
              <label className={lbl}>From<input type="date" name="start_date" required className={inputCls} /></label>
              <label className={lbl}>To<input type="date" name="end_date" required className={inputCls} /></label>
              <label className={lbl}>Note<input name="note" className={inputCls} /></label>
              <div className="sm:col-span-3"><button className={submitCls}>Record leave</button></div>
            </form>
          </Card>
          <Card title="Leave history">
            <Table head={['Person', 'Kind', 'From', 'To', 'Days', 'Status', '']}
              rows={X.leave.map((l: any) => [l.full_name, KIND_LABEL[l.kind], d(l.start_date), d(l.end_date), l.days, <Badge key="s" tone={l.status === 'approved' ? 'green' : 'grey'}>{l.status}</Badge>,
                l.status === 'approved' ? <form key="c" action={cancelLeave}><input type="hidden" name="id" value={l.id} /><button className="text-xs font-bold text-red-700 underline">Cancel</button></form> : ''])} empty="No leave recorded." />
          </Card>
        </div>
      )}

      {view === 'hiring' && (
        <div className="space-y-5">
          {X.openings.length === 0 && <Card><p className="text-sm text-slate-600">No roles yet. Open a role below, add candidates as they come in, and record each interview with a score so choices are fair and can be explained later.</p></Card>}
          {X.openings.map((o: any) => {
            const cs = X.cands.filter((c: any) => c.opening_id === o.id);
            return (
              <Card key={o.id} title={`${o.title}${o.department ? ` · ${o.department}` : ''}`} subtitle={`${o.status === 'open' ? 'Open' : o.status} since ${d(o.opened_on)}${o.description ? ` · ${o.description}` : ''}`}
                action={<form action={setOpeningStatus} className="flex gap-2"><input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value={o.status === 'open' ? 'closed' : 'open'} /><button className="text-xs font-bold text-teal underline">{o.status === 'open' ? 'Close role' : 'Reopen'}</button></form>}>
                <Table head={['Candidate', 'Stage', 'Interviews', 'Avg score (of 5)', 'Latest view', 'Move to', '']}
                  rows={cs.map((c: any) => [
                    <div key="n"><b>{c.full_name}</b><div className="text-xs text-slate-500">{[c.phone, c.email, c.source].filter(Boolean).join(' · ')}{c.expected_pay_kes ? ` · expects ${kes(c.expected_pay_kes)}` : ''}</div></div>,
                    <Badge key="s" tone={c.stage === 'hired' ? 'green' : ['rejected', 'withdrew'].includes(c.stage) ? 'grey' : 'gold'}>{c.stage}</Badge>, c.n_int, c.avg_score ? c.avg_score.toFixed(1) : '', c.last_rec ? REC[c.last_rec] : '',
                    <form key="m" action={moveCandidate} className="flex gap-1"><input type="hidden" name="id" value={c.id} /><select name="stage" defaultValue={c.stage} className="rounded border border-teal-100 px-1 py-0.5 text-xs">{STAGES.map((s) => <option key={s}>{s}</option>)}</select><button className="text-xs font-bold text-teal underline">Go</button></form>,
                    c.stage === 'offer' ? <form key="h" action={hireCandidate}><input type="hidden" name="id" value={c.id} /><button className="rounded bg-teal px-2 py-1 text-xs font-bold text-white">Hire</button></form> : ''])} empty="No candidates yet." />
              </Card>
            );
          })}
          <Card title="Add a candidate">
            <form action={addCandidate} className="grid gap-3 sm:grid-cols-3">
              <label className={lbl}>Role{sel('opening_id', X.openings.filter((o: any) => o.status === 'open').map((o: any): [string, string] => [o.id, o.title]))}</label>
              <label className={lbl}>Full name<input name="full_name" required className={inputCls} /></label>
              <label className={lbl}>Source (referral, post, walk-in)<input name="source" className={inputCls} /></label>
              <label className={lbl}>Phone<input name="phone" className={inputCls} /></label>
              <label className={lbl}>Email<input name="email" className={inputCls} /></label>
              <label className={lbl}>Expected pay (KES)<input name="expected_pay_kes" inputMode="decimal" className={inputCls} /></label>
              <div className="sm:col-span-3"><button className={submitCls}>Add candidate</button></div>
            </form>
          </Card>
          <Card title="Record an interview" subtitle="Score each area from 1 (weak) to 5 (excellent). Score the same four things for every candidate so they can be compared fairly.">
            <form action={addInterview} className="grid gap-3 sm:grid-cols-4">
              <label className={`${lbl} sm:col-span-2`}>Candidate{sel('candidate_id', X.cands.filter((c: any) => !['hired', 'rejected', 'withdrew'].includes(c.stage)).map((c: any): [string, string] => [c.id, c.full_name]))}</label>
              <label className={lbl}>Date<input type="date" name="interview_on" defaultValue={today} required className={inputCls} /></label>
              <label className={lbl}>How{sel('mode', [['in_person', 'In person'], ['phone', 'Phone'], ['online', 'Online']])}</label>
              <label className={lbl}>Skills for the role<input name="score_skills" type="number" min={1} max={5} className={inputCls} /></label>
              <label className={lbl}>Communication<input name="score_communication" type="number" min={1} max={5} className={inputCls} /></label>
              <label className={lbl}>Fit with Elimu+ values<input name="score_values" type="number" min={1} max={5} className={inputCls} /></label>
              <label className={lbl}>Problem solving<input name="score_problem" type="number" min={1} max={5} className={inputCls} /></label>
              <label className={lbl}>Interviewer<input name="interviewer" className={inputCls} /></label>
              <label className={lbl}>Recommendation{sel('recommendation', [['', 'Not decided'], ['strong_yes', 'Strong yes'], ['yes', 'Yes'], ['maybe', 'Maybe'], ['no', 'No']])}</label>
              <label className={`${lbl} sm:col-span-2`}>Notes<input name="notes" className={inputCls} /></label>
              <div className="sm:col-span-4"><button className={submitCls}>Save interview</button></div>
            </form>
          </Card>
          <Card title="Open a role">
            <form action={addOpening} className="grid gap-3 sm:grid-cols-3">
              <label className={lbl}>Title<input name="title" required className={inputCls} /></label>
              <label className={lbl}>Department{sel('department', DEPTS.map((x) => [x, x]))}</label>
              <label className={lbl}>What the role does<input name="description" className={inputCls} /></label>
              <div className="sm:col-span-3"><button className={submitCls}>Open the role</button></div>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
