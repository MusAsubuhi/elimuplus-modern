import Link from 'next/link';
import { redirect } from 'next/navigation';
import { asAdmin } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { Badge, Card, PageHeader, Stat, Table } from '@/components/ui';
import { d, kes } from '@/lib/format';
import { LEAVE_ENTITLEMENT } from '@/lib/payroll';
import { MONTHS } from '@/components/payslip';

// An employee's own pay, leave and targets. Everything is filtered to the employee tied to the signed-in login; nobody else's pay is ever read here.
export default async function MyPay() {
  const me = await requireMe();
  const X = await asAdmin(async (q) => {
    const e = (await q(`select id, full_name, job_title, department, employment_type, start_date::text sd, contract_end::text ce, probation_end::text pe, manager_id from employees where person_id=$1`, [me.id]))[0];
    if (!e) return null;
    const yr = Number(new Date().toISOString().slice(0, 4));
    return {
      e,
      manager: e.manager_id ? (await q('select full_name from employees where id=$1', [e.manager_id]))[0]?.full_name : null,
      slips: await q(`select s.id, s.run_id, r.period_start::text ps, s.gross::float8 gross, s.net::float8 net, s.paye::float8 paye, s.nssf_ee::float8 nssf, s.shif::float8 shif, s.housing_ee::float8 housing, r.status, r.net_paid_on::text paid
                      from payslips s join payroll_runs r on r.id=s.run_id where s.employee_id=$1 and r.status in ('approved','paid') order by r.period_start desc limit 24`, [e.id]),
      leave: await q(`select kind, start_date::text sd, end_date::text ed, days::float8 days, status from leave_requests where employee_id=$1 and status <> 'cancelled' order by start_date desc limit 15`, [e.id]),
      taken: await q(`select kind, sum(days)::float8 days from leave_requests where employee_id=$1 and status='approved' and extract(year from start_date)=$2 group by 1`, [e.id, yr]),
      kpis: await q(`select period, title, unit, target::float8 t, actual::float8 a from kpis where employee_id=$1 order by period desc, created_at`, [e.id]),
    };
  });
  if (!X) redirect('/portal');
  await audit(me.id, 'view own pay', 'payslips');
  const { e } = X; const taken = (k: string) => X.taken.find((t: any) => t.kind === k)?.days ?? 0;
  const annualLeft = Math.max(0, (LEAVE_ENTITLEMENT.annual as number) - taken('annual'));
  return (
    <>
      <PageHeader image="/images/hero-bg.jpg" title="My pay and leave" subtitle={`${e.full_name} · ${e.job_title} · ${e.department}${X.manager ? ` · reports to ${X.manager}` : ''}`} />
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Stat label="Started" value={d(e.sd)} /><Stat tone="gold" label="Annual leave left this year" value={annualLeft} sub="of 21 working days" />
        <Stat label="Contract ends" value={e.ce ? d(e.ce) : 'Open'} /><Stat tone="green" label="Latest net pay" value={X.slips[0] ? kes(X.slips[0].net) : '-'} sub={X.slips[0] ? `${MONTHS[Number(X.slips[0].ps.slice(5, 7)) - 1]} ${X.slips[0].ps.slice(0, 4)}` : ''} />
      </div>
      <div className="space-y-5">
        <Card title="My payslips" subtitle="Appears here once a month's payroll is approved. Open one to print or save it.">
          <Table head={['Month', 'Gross', 'PAYE', 'NSSF', 'SHIF', 'Housing levy', 'Net pay', 'Paid']}
            rows={X.slips.map((s: any) => [<Link key="m" href={`/portal/my-pay/print?run=${s.run_id}`} className="font-bold text-teal underline">{MONTHS[Number(s.ps.slice(5, 7)) - 1]} {s.ps.slice(0, 4)}</Link>, kes(s.gross), kes(s.paye), kes(s.nssf), kes(s.shif), kes(s.housing), <b key="n">{kes(s.net)}</b>, s.paid ? d(s.paid) : <Badge key="p" tone="gold">being paid</Badge>])} empty="No payslips yet." />
        </Card>
        <Card title="My leave" subtitle="Annual leave is 21 working days a year. Ask a founder to record leave you take.">
          <Table head={['Kind', 'From', 'To', 'Days', 'Status']} rows={X.leave.map((l: any) => [l.kind, d(l.sd), d(l.ed), l.days, l.status])} empty="No leave recorded." />
        </Card>
        {X.kpis.length > 0 && (
          <Card title="My targets" subtitle="The measures agreed for each period, and where you are.">
            <Table head={['Period', 'Target', 'Aim', 'Result so far']} rows={X.kpis.map((k: any) => [k.period, k.title, `${k.t}${k.unit ? ` ${k.unit}` : ''}`, k.a == null ? '' : `${k.a}${k.unit ? ` ${k.unit}` : ''}`])} />
          </Card>
        )}
        <p className="text-xs text-slate-500">If something here looks wrong, tell a founder. Only you and the founders can see this page.</p>
      </div>
    </>
  );
}
