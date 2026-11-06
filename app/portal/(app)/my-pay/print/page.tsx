import { notFound } from 'next/navigation';
import { asAdmin } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import PrintButton from '@/components/print-button';
import Payslip, { MONTHS } from '@/components/payslip';

export default async function MyPayslipPrint({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const me = await requireMe(); const sp = await searchParams;
  if (!sp.run || !/^[0-9a-f-]{36}$/i.test(sp.run)) notFound();
  const s = await asAdmin(async (q) => (await q(`select s.*, r.period_start::text ps, e.full_name, e.job_title, e.kra_pin, e.nssf_no, e.sha_no, e.pay_to
      from payslips s join payroll_runs r on r.id=s.run_id join employees e on e.id=s.employee_id
      where s.run_id=$1 and e.person_id=$2 and r.status in ('approved','paid')`, [sp.run, me.id]))[0]);
  if (!s) notFound();
  await audit(me.id, 'print own payslip', 'payslips');
  const [y, m] = s.ps.split('-').map(Number);
  return (
    <div className="mx-auto max-w-[800px] bg-white p-4">
      <div className="no-print mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"><span className="font-bold">Payslip · {MONTHS[m - 1]} {y}</span><PrintButton label="Print or save as PDF" /></div>
      <Payslip s={s} year={y} month={m} />
    </div>
  );
}
