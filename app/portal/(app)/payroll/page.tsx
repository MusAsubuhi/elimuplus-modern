import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { Badge, Card, PageHeader, Stat, Table, inputCls, submitCls } from '@/components/ui';
import { d, kes } from '@/lib/format';
import { remitDue } from '@/lib/payroll';
import { addRate, createRun } from '../../hr-actions';

const lbl = 'block text-xs font-bold text-slate-600';
export default async function Payroll({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const me = await requireMe('founder');
  await audit(me.id, 'view payroll', 'payroll_runs');
  const view = sp.view === 'rates' ? 'rates' : 'runs';
  const X = await asUser(me.id, async (q) => ({
    runs: await q(`select r.*, r.period_start::text ps, r.net_paid_on::text npo, r.statutory_paid_on::text spo, gross_kes::float8 gross, net_kes::float8 net, employer_kes::float8 employer, statutory_kes::float8 statutory,
                   (select count(*)::int from payslips s where s.run_id=r.id) n from payroll_runs r order by r.period_start desc`),
    rates: await q(`select key, value::float8 value, effective_from::text effective_from, note from statutory_rates order by key, effective_from desc`),
    heads: (await q(`select count(*)::int n, coalesce(sum(basic_kes+allowances_kes),0)::float8 pay from employees where status <> 'exited'`))[0],
  }));
  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = (() => { const last = X.runs.find((r: any) => r.status !== 'void'); const t = new Date(); if (!last) return today.slice(0, 7); const [y, m] = last.ps.slice(0, 7).split('-').map(Number); const dt = new Date(Date.UTC(y, m, 1)); return dt.toISOString().slice(0, 7); })();
  const owed = X.runs.filter((r: any) => ['approved', 'paid'].includes(r.status)).reduce((a: number, r: any) => a + (r.npo ? 0 : r.net) + (r.spo ? 0 : r.statutory), 0);
  return (
    <>
      <PageHeader image="/images/hero-bg.jpg" title="Payroll" subtitle="Monthly pay with PAYE, NSSF, SHIF, the Housing Levy and NITA worked out for you. Approved runs flow into the profit and loss and into what Elimu+ owes.">
        <Link href="/portal/hr" className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-teal">People and HR</Link>
      </PageHeader>
      <div className="mb-5 flex gap-2">
        {[['runs', 'Payroll runs'], ['rates', 'Statutory rates']].map(([k, t]) => <Link key={k} href={`/portal/payroll?view=${k}`} className={`rounded-full px-4 py-1.5 text-sm font-bold ${view === k ? 'bg-teal text-white' : 'border border-teal-100 bg-white text-teal'}`}>{t}</Link>)}
      </div>
      {view === 'runs' && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="People on payroll" value={X.heads.n} /><Stat tone="gold" label="Gross pay bill per month" value={kes(X.heads.pay)} /><Stat tone="red" label="Payroll still to pay out" value={kes(owed)} sub="net pay and statutory amounts not yet recorded as paid" />
          </div>
          <Card title="Prepare a month" subtitle="Takes every employee who worked in the month (part months are prorated by calendar days) and works out the deductions. You can add a bonus or an advance recovery before approving.">
            <form action={createRun} className="flex flex-wrap items-end gap-3">
              <label className={lbl}>Month<input type="month" name="month" defaultValue={nextMonth} required className={inputCls} /></label>
              <button className={submitCls}>Prepare payroll</button>
            </form>
          </Card>
          <Card title="Runs">
            <Table head={['Month', 'People', 'Gross', 'Net pay', 'Statutory due', 'Status', 'Pay by']}
              rows={X.runs.map((r: any) => [<Link key="m" href={`/portal/payroll/${r.id}`} className="font-bold text-teal underline">{r.ps.slice(0, 7)}</Link>, r.n, kes(r.gross), kes(r.net), kes(r.statutory),
                <Badge key="s" tone={r.status === 'paid' ? 'green' : r.status === 'approved' ? 'gold' : r.status === 'void' ? 'grey' : 'blue'}>{r.status}</Badge>,
                r.status === 'approved' && !r.spo ? <span key="due" className={remitDue(r.ps.slice(0, 7)) < today ? 'font-bold text-red-700' : ''}>{d(remitDue(r.ps.slice(0, 7)))}</span> : ''])} empty="No payroll run yet." />
          </Card>
        </div>
      )}
      {view === 'rates' && (
        <div className="space-y-5">
          <Card title="Statutory rates in force" subtitle="Each rate has an effective date. When the law changes, add a new row with the new date; old months keep the rate that applied then. These come from published Kenyan sources and should be confirmed with KRA, NSSF, SHA or your accountant before you file.">
            <Table head={['Rate', 'Value', 'From', 'Note']} rows={X.rates.map((r: any) => [<code key="k">{r.key}</code>, r.value, d(r.effective_from), r.note ?? ''])} />
          </Card>
          <Card title="Add or change a rate">
            <form action={addRate} className="grid gap-3 sm:grid-cols-4">
              <label className={lbl}>Key (for example nssf_upper)<input name="key" required className={inputCls} /></label>
              <label className={lbl}>Value<input name="value" inputMode="decimal" required className={inputCls} /></label>
              <label className={lbl}>Effective from<input type="date" name="effective_from" required className={inputCls} /></label>
              <label className={lbl}>Note<input name="note" className={inputCls} /></label>
              <div className="sm:col-span-4"><button className={submitCls}>Save rate</button></div>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
