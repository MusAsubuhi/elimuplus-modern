import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, Table, inputCls, submitCls } from '@/components/ui';
import { d, kes } from '@/lib/format';
import { remitDue } from '@/lib/payroll';
import { approveRun, markPaid, recalcRun, savePayslipAdjust, voidRun } from '../../../hr-actions';

const f2 = (n: number) => n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default async function Run({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe('founder');
  const X = await asUser(me.id, async (q) => {
    const r = (await q(`select *, period_start::text ps, net_paid_on::text npo, statutory_paid_on::text spo from payroll_runs where id=$1`, [id]))[0];
    if (!r) return null;
    const slips = await q(`select s.*, e.full_name, e.job_title, e.kra_pin from payslips s join employees e on e.id=s.employee_id where s.run_id=$1 order by e.full_name`, [id]);
    return { r, slips };
  });
  if (!X) notFound();
  const { r, slips } = X; const ym = r.ps.slice(0, 7); const draft = r.status === 'draft';
  const sum = (k: string) => slips.reduce((a: number, s: any) => a + Number(s[k]), 0);
  const today = new Date().toISOString().slice(0, 10);
  const returns: [string, number, number][] = [['PAYE (to KRA)', sum('paye'), 0], ['NSSF (employee and employer)', sum('nssf_ee'), sum('nssf_er')], ['SHIF (to SHA)', sum('shif'), 0], ['Affordable Housing Levy', sum('housing_ee'), sum('housing_er')], ['NITA levy', 0, sum('nita')]];
  return (
    <>
      <PageHeader image="/images/hero-bg.jpg" title={`Payroll ${ym}`} subtitle={`${slips.length} people · statutory returns due ${d(remitDue(ym))}`}>
        <Badge tone={r.status === 'paid' ? 'green' : r.status === 'approved' ? 'gold' : 'blue'}>{r.status}</Badge>
        <Link href="/portal/payroll" className="rounded-lg bg-white/15 px-3 py-1 text-xs font-bold">All runs</Link>
        <Link href={`/portal/payroll/${id}/print`} className="rounded-lg bg-gold px-3 py-1 text-xs font-bold text-teal">Print all payslips</Link>
      </PageHeader>
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Stat label="Gross pay" value={kes(sum('gross'))} /><Stat tone="green" label="Net pay to staff" value={kes(sum('net'))} />
        <Stat tone="gold" label="Employer extras (NSSF, levy, NITA)" value={kes(sum('nssf_er') + sum('housing_er') + sum('nita'))} /><Stat tone="red" label="To remit to authorities" value={kes(r.statutory_kes)} sub={`due ${d(remitDue(ym))}`} />
      </div>
      <div className="space-y-5">
        <Card title="Payslips" subtitle={draft ? 'Add a bonus (taxed) or an advance recovery (taken after tax) on any line; tax is recalculated. An advance recovered here is assumed to have been recorded as an expense when it was given, so it reduces the pay cost in the books.' : 'Locked.'}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500">{['Name', 'Days', 'Gross', 'NSSF', 'SHIF', 'Housing', 'PAYE', 'Other', 'Net', draft ? 'Bonus / advance' : ''].map((h) => <th key={h} className="py-1 pr-3">{h}</th>)}</tr></thead>
              <tbody>{slips.map((s: any) => (
                <tr key={s.id} className="border-t border-teal-100 align-top">
                  <td className="py-1.5 pr-3"><Link href={`/portal/payroll/${id}/print?employee=${s.employee_id}`} className="font-bold text-teal underline">{s.full_name}</Link><div className="text-xs text-slate-500">{s.job_title}</div></td>
                  <td className="pr-3">{s.days_worked}/{s.days_in_month}</td><td className="pr-3 tabular-nums">{f2(Number(s.gross))}</td><td className="pr-3 tabular-nums">{f2(Number(s.nssf_ee))}</td><td className="pr-3 tabular-nums">{f2(Number(s.shif))}</td>
                  <td className="pr-3 tabular-nums">{f2(Number(s.housing_ee))}</td><td className="pr-3 tabular-nums">{f2(Number(s.paye))}</td><td className="pr-3 tabular-nums">{Number(s.other_deduction) ? f2(Number(s.other_deduction)) : ''}</td><td className="pr-3 font-bold tabular-nums">{f2(Number(s.net))}</td>
                  <td>{draft && <form action={savePayslipAdjust} className="flex flex-wrap gap-1"><input type="hidden" name="id" value={s.id} /><input type="hidden" name="run_id" value={id} />
                    <input name="bonus" defaultValue={Number(s.bonus) || ''} placeholder="Bonus" className="w-20 rounded border border-teal-100 px-1 py-0.5 text-xs" /><input name="other" defaultValue={Number(s.other_deduction) || ''} placeholder="Advance" className="w-20 rounded border border-teal-100 px-1 py-0.5 text-xs" />
                    <input name="note" defaultValue={s.other_note ?? ''} placeholder="Note" className="w-24 rounded border border-teal-100 px-1 py-0.5 text-xs" /><button className="text-xs font-bold text-teal underline">Apply</button></form>}</td>
                </tr>))}
                {slips.length === 0 && <tr><td colSpan={10} className="py-3 text-slate-500">No one was employed in this month. Add team members under People and HR, then recalculate.</td></tr>}
              </tbody></table>
          </div>
        </Card>
        <Card title="What to pay to whom" subtitle={`PAYE, NSSF, SHIF and the Housing Levy are due by ${d(remitDue(ym))}. Check the NITA date with NITA; it is shown here with the others for convenience.`}>
          <Table head={['Authority', 'Taken from staff', 'Paid by Elimu+ on top', 'Total to remit']}
            rows={[...returns.map(([n, a, b]) => [n, kes(a), kes(b), kes(a + b)]), [<b key="t">Total</b>, kes(returns.reduce((x, y) => x + y[1], 0)), kes(returns.reduce((x, y) => x + y[2], 0)), <b key="g">{kes(Number(r.statutory_kes))}</b>]]} />
        </Card>
        <Card title="Steps">
          <div className="flex flex-wrap items-end gap-4">
            {draft && <form action={recalcRun}><input type="hidden" name="id" value={id} /><button className="rounded-lg border border-teal-100 px-4 py-2 text-sm font-bold text-teal">Recalculate from current pay and rates</button></form>}
            {draft && slips.length > 0 && <form action={approveRun}><input type="hidden" name="id" value={id} /><button className={submitCls}>Approve this payroll</button></form>}
            {['approved', 'paid'].includes(r.status) && (<>
              <form action={markPaid} className="flex items-end gap-2"><input type="hidden" name="id" value={id} /><input type="hidden" name="which" value="net" />
                <label className="text-xs font-bold text-slate-600">Net pay paid on<input type="date" name="on" defaultValue={r.npo ?? today} className={inputCls} /></label><button className={submitCls}>{r.npo ? 'Update' : 'Record paid'}</button></form>
              <form action={markPaid} className="flex items-end gap-2"><input type="hidden" name="id" value={id} /><input type="hidden" name="which" value="statutory" />
                <label className="text-xs font-bold text-slate-600">Statutory remitted on<input type="date" name="on" defaultValue={r.spo ?? today} className={inputCls} /></label><button className={submitCls}>{r.spo ? 'Update' : 'Record remitted'}</button></form>
            </>)}
            {r.status !== 'void' && !r.npo && !r.spo && <form action={voidRun}><input type="hidden" name="id" value={id} /><button className="rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-700">Void this run</button></form>}
          </div>
          <p className="mt-3 text-xs text-slate-500">Approving adds gross pay and employer contributions to the profit and loss for the month, and net pay plus statutory amounts to what Elimu+ owes until you record them paid. Paying staff and the authorities happens outside the portal (M-Pesa, bank, iTax, the NSSF and SHA portals); record the dates here.</p>
        </Card>
      </div>
    </>
  );
}
