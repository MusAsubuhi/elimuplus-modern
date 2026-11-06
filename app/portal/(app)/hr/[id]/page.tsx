import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { Badge, Card, PageHeader, Stat, Table, inputCls, submitCls } from '@/components/ui';
import { d, kes } from '@/lib/format';
import { addKpi, addLeave, addReview, exitEmployee, reinstateEmployee, saveEmployee, saveKpiActual, saveOnboarding } from '../../../hr-actions';

const lbl = 'block text-xs font-bold text-slate-600';
const CHECK: [string, string][] = [['contract', 'Signed contract or offer letter on file'], ['id_copy', 'Copy of national ID'], ['kra_pin', 'KRA PIN certificate'], ['nssf', 'NSSF number registered'], ['sha', 'SHA (SHIF) number registered'], ['bank', 'Pay details confirmed (M-Pesa or bank)'], ['induction', 'Induction done: values, safeguarding and child protection, data privacy'], ['policies', 'Read and signed the staff policies'], ['equipment', 'Equipment handed over']];
// Starting points for KPIs by department; edit freely.
const SUGGEST: Record<string, string[]> = {
  Programme: ['Training days delivered on schedule|days', 'Participant attendance rate|%', 'Session notes filed the same day|%', 'Follow-up visits completed on time|%', 'Participant satisfaction|score of 5'],
  Partnerships: ['Partner meetings held|meetings', 'Quotes sent|quotes', 'Quotes signed|quotes', 'Invoices paid within 14 days|%'],
  Marketing: ['Posts published to plan|posts', 'New enquiries from social and web|enquiries', 'Newsletter open rate|%'],
  'Finance and admin': ['Expenses reconciled within 7 days|%', 'Invoices raised on time|%', 'Statutory returns filed by the 9th|% of months'],
  Leadership: ['Cohorts delivered|cohorts', 'Revenue invoiced|KES', 'Cash collected|KES'],
  Other: ['Key task completed on time|%'],
};

export default async function Employee({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe('founder');
  const X = await asUser(me.id, async (q) => {
    const e = (await q(`select *, start_date::text sd, probation_end::text pe, contract_end::text ce, end_date::text ed, basic_kes::float8 basic, allowances_kes::float8 allow from employees where id=$1`, [id]))[0];
    if (!e) return null;
    return {
      e,
      people: await q(`select id, full_name from employees where id <> $1 and status <> 'exited' order by full_name`, [id]),
      kpis: await q('select *, target::float8 t, actual::float8 a from kpis where employee_id=$1 order by period desc, created_at', [id]),
      reviews: await q('select * from reviews where employee_id=$1 order by reviewed_on desc', [id]),
      leave: await q('select * from leave_requests where employee_id=$1 order by start_date desc limit 20', [id]),
      slips: await q(`select s.*, r.period_start::text ps, r.status from payslips s join payroll_runs r on r.id=s.run_id where s.employee_id=$1 and r.status <> 'void' order by r.period_start desc limit 12`, [id]),
    };
  });
  if (!X) notFound();
  await audit(me.id, `view employee ${id}`, 'employees');
  const { e } = X; const ob = (e.onboarding ?? {}) as Record<string, boolean>;
  const periods = [...new Set(X.kpis.map((k: any) => k.period))];
  const thisPeriod = (() => { const t = new Date(); return `${t.getFullYear()} Q${Math.floor(t.getMonth() / 3) + 1}`; })();
  const attain = (k: any) => (k.a == null || !k.t ? null : Math.min(150, Math.round((k.a / k.t) * 100)));
  const scoreFor = (p: string) => { const ks = X.kpis.filter((k: any) => k.period === p && attain(k) != null); const w = ks.reduce((a: number, k: any) => a + k.weight, 0); return w ? Math.round(ks.reduce((a: number, k: any) => a + attain(k)! * k.weight, 0) / w) : null; };
  return (
    <>
      <PageHeader image="/images/hero-bg.jpg" title={e.full_name} subtitle={`${e.job_title} · ${e.department} · ${e.employment_type} · started ${d(e.sd)}${e.ed ? ` · left ${d(e.ed)}` : ''}`}>
        <Link href="/portal/hr?view=team" className="rounded-lg bg-white/15 px-3 py-1 text-xs font-bold">All team</Link>
      </PageHeader>
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Stat label="Status" value={e.status.replace('_', ' ')} /><Stat tone="gold" label="Gross pay per month" value={kes(e.basic + e.allow)} />
        <Stat label="Probation ends" value={e.pe ? d(e.pe) : 'Not set'} /><Stat tone="red" label="Contract ends" value={e.ce ? d(e.ce) : 'Open'} />
      </div>
      <div className="space-y-5">
        <Card title="Details and pay" subtitle="Tax numbers are kept for payroll returns. Only founders can see this page.">
          <form action={saveEmployee} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="id" value={e.id} />
            <label className={lbl}>Full name<input name="full_name" defaultValue={e.full_name} required className={inputCls} /></label>
            <label className={lbl}>Job title<input name="job_title" defaultValue={e.job_title} required className={inputCls} /></label>
            <label className={lbl}>Department<select name="department" defaultValue={e.department} className={inputCls}>{Object.keys(SUGGEST).map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className={lbl}>Type<select name="employment_type" defaultValue={e.employment_type} className={inputCls}>{['permanent', 'contract', 'casual', 'intern'].map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className={lbl}>Start date<input type="date" name="start_date" defaultValue={e.sd} required className={inputCls} /></label>
            <label className={lbl}>Probation ends<input type="date" name="probation_end" defaultValue={e.pe ?? ''} className={inputCls} /></label>
            <label className={lbl}>Contract ends<input type="date" name="contract_end" defaultValue={e.ce ?? ''} className={inputCls} /></label>
            <label className={lbl}>Reports to<select name="manager_id" defaultValue={e.manager_id ?? ''} className={inputCls}><option value="">No one</option>{X.people.map((p: any) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
            <label className={lbl}>Basic pay per month (KES)<input name="basic_kes" defaultValue={e.basic} className={inputCls} /></label>
            <label className={lbl}>Taxable allowances per month (KES)<input name="allowances_kes" defaultValue={e.allow} className={inputCls} /></label>
            <label className={lbl}>Phone<input name="phone" defaultValue={e.phone ?? ''} className={inputCls} /></label>
            <label className={lbl}>Email<input name="email" defaultValue={e.email ?? ''} className={inputCls} /></label>
            <label className={lbl}>KRA PIN<input name="kra_pin" defaultValue={e.kra_pin ?? ''} className={inputCls} /></label>
            <label className={lbl}>NSSF number<input name="nssf_no" defaultValue={e.nssf_no ?? ''} className={inputCls} /></label>
            <label className={lbl}>SHA number<input name="sha_no" defaultValue={e.sha_no ?? ''} className={inputCls} /></label>
            <label className={lbl}>Pay to (M-Pesa number or bank)<input name="pay_to" defaultValue={e.pay_to ?? ''} className={inputCls} /></label>
            <label className={lbl}>Emergency contact<input name="emergency_name" defaultValue={e.emergency_name ?? ''} className={inputCls} /></label>
            <label className={lbl}>Emergency phone<input name="emergency_phone" defaultValue={e.emergency_phone ?? ''} className={inputCls} /></label>
            <label className={`${lbl} sm:col-span-3`}>Notes<input name="note" defaultValue={e.note ?? ''} className={inputCls} /></label>
            <div className="sm:col-span-3"><button className={submitCls}>Save</button></div>
          </form>
        </Card>

        <Card title="Onboarding checklist" subtitle="Everything an employer should have on file in the first weeks.">
          <form action={saveOnboarding} className="grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="id" value={e.id} />
            {CHECK.map(([k, t]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" name={k} defaultChecked={!!ob[k]} />{t}</label>)}
            <div className="sm:col-span-2"><button className={submitCls}>Save checklist</button> <span className="ml-2 text-xs text-slate-500">{CHECK.filter(([k]) => ob[k]).length} of {CHECK.length} done</span></div>
          </form>
        </Card>

        <Card title="KPIs" subtitle="Agree a few measurable targets for the period. Attainment is the result divided by the target, weighted.">
          {periods.length === 0 && <p className="mb-3 text-sm text-slate-600">No KPIs yet. Pick from the suggestions for {e.department} below, then adjust the target.</p>}
          {periods.map((p: string) => (
            <div key={p} className="mb-4">
              <div className="mb-1 flex items-baseline justify-between"><b className="text-teal">{p}</b>{scoreFor(p) != null && <span className="text-sm">Weighted attainment <b>{scoreFor(p)}%</b></span>}</div>
              <Table head={['KPI', 'Target', 'Result', 'Attained', 'Weight']}
                rows={X.kpis.filter((k: any) => k.period === p).map((k: any) => [k.title, `${k.t}${k.unit ? ` ${k.unit}` : ''}`,
                  <form key="f" action={saveKpiActual} className="flex gap-1"><input type="hidden" name="id" value={k.id} /><input type="hidden" name="employee_id" value={e.id} /><input name="actual" defaultValue={k.a ?? ''} className="w-24 rounded border border-teal-100 px-1 py-0.5 text-sm" /><button className="text-xs font-bold text-teal underline">Save</button></form>,
                  attain(k) == null ? '' : <Badge key="a" tone={attain(k)! >= 100 ? 'green' : attain(k)! >= 70 ? 'gold' : 'red'}>{attain(k)}%</Badge>, k.weight])} />
            </div>
          ))}
          <form action={addKpi} className="grid gap-3 sm:grid-cols-5">
            <input type="hidden" name="employee_id" value={e.id} />
            <label className={`${lbl} sm:col-span-2`}>KPI<input name="title" list="kpi-suggest" required className={inputCls} /></label>
            <datalist id="kpi-suggest">{(SUGGEST[e.department] ?? []).map((s) => <option key={s} value={s.split('|')[0]} />)}</datalist>
            <label className={lbl}>Target<input name="target" inputMode="decimal" required className={inputCls} /></label>
            <label className={lbl}>Unit<input name="unit" placeholder="%, days, KES" className={inputCls} /></label>
            <label className={lbl}>Period<input name="period" defaultValue={thisPeriod} required className={inputCls} /></label>
            <label className={lbl}>Weight 1 to 10<input name="weight" type="number" min={1} max={10} defaultValue={1} className={inputCls} /></label>
            <div className="sm:col-span-5"><button className={submitCls}>Add KPI</button></div>
          </form>
        </Card>

        <Card title="Performance reviews" subtitle="Rate 1 to 5. Write what went well, what to develop and what the next goals are, so the conversation has a record.">
          <Table head={['Period', 'Rating', 'Strengths', 'To develop', 'Next goals', 'Reviewed']}
            rows={X.reviews.map((r: any) => [r.period, r.rating ?? '', r.strengths ?? '', r.development ?? '', r.next_goals ?? '', d(r.reviewed_on)])} empty="No reviews yet." />
          <form action={addReview} className="mt-4 grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="employee_id" value={e.id} />
            <label className={lbl}>Period<input name="period" defaultValue={thisPeriod} required className={inputCls} /></label>
            <label className={lbl}>Rating 1 to 5<input name="rating" type="number" min={1} max={5} className={inputCls} /></label>
            <label className={`${lbl} sm:col-span-2`}>Strengths<input name="strengths" className={inputCls} /></label>
            <label className={`${lbl} sm:col-span-2`}>To develop<input name="development" className={inputCls} /></label>
            <label className={`${lbl} sm:col-span-2`}>Next goals<input name="next_goals" className={inputCls} /></label>
            <div className="sm:col-span-4"><button className={submitCls}>Save review</button></div>
          </form>
        </Card>

        <Card title="Leave">
          <Table head={['Kind', 'From', 'To', 'Days', 'Status']} rows={X.leave.map((l: any) => [l.kind, d(l.start_date), d(l.end_date), l.days, l.status])} empty="No leave recorded." />
          <form action={addLeave} className="mt-4 grid gap-3 sm:grid-cols-5">
            <input type="hidden" name="employee_id" value={e.id} /><input type="hidden" name="back" value={`/portal/hr/${e.id}`} />
            <label className={lbl}>Kind<select name="kind" className={inputCls}>{['annual', 'sick', 'maternity', 'paternity', 'compassionate', 'unpaid', 'study'].map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className={lbl}>From<input type="date" name="start_date" required className={inputCls} /></label>
            <label className={lbl}>To<input type="date" name="end_date" required className={inputCls} /></label>
            <label className={lbl}>Working days<input name="days" required className={inputCls} /></label>
            <label className={lbl}>Note<input name="note" className={inputCls} /></label>
            <div className="sm:col-span-5"><button className={submitCls}>Record leave</button></div>
          </form>
        </Card>

        <Card title="Payslips">
          <Table head={['Month', 'Gross', 'PAYE', 'NSSF', 'SHIF', 'Housing', 'Net']}
            rows={X.slips.map((s: any) => [<Link key="m" href={`/portal/payroll/${s.run_id}/print?employee=${e.id}`} className="font-bold text-teal underline">{s.ps.slice(0, 7)}</Link>, kes(s.gross), kes(s.paye), kes(s.nssf_ee), kes(s.shif), kes(s.housing_ee), kes(s.net)])} empty="No payslips yet." />
        </Card>

        <Card title={e.status === 'exited' ? 'Exited' : 'Leaving the company'} subtitle={e.exit_reason ?? undefined}>
          {e.status === 'exited'
            ? <form action={reinstateEmployee}><input type="hidden" name="id" value={e.id} /><button className={submitCls}>Put back on the active list</button></form>
            : <form action={exitEmployee} className="flex flex-wrap items-end gap-3"><input type="hidden" name="id" value={e.id} />
                <label className={lbl}>Last working day<input type="date" name="end_date" required className={inputCls} /></label>
                <label className={lbl}>Reason<input name="exit_reason" className={inputCls} /></label><button className="rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-700">Mark as exited</button></form>}
        </Card>
      </div>
    </>
  );
}
