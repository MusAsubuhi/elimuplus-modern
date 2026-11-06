import { notFound } from 'next/navigation';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import PrintButton from '@/components/print-button';
import Payslip, { MONTHS } from '@/components/payslip';

export default async function PayslipPrint({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ employee?: string }> }) {
  const { id } = await params; const sp = await searchParams;
  const me = await requireMe('founder');
  const X = await asUser(me.id, async (q) => {
    const r = (await q(`select id, period_start::text ps, status from payroll_runs where id=$1`, [id]))[0];
    if (!r) return null;
    const slips = await q(`select s.*, e.full_name, e.job_title, e.kra_pin, e.nssf_no, e.sha_no, e.pay_to from payslips s join employees e on e.id=s.employee_id where s.run_id=$1 ${sp.employee ? 'and s.employee_id=$2' : ''} order by e.full_name`, sp.employee ? [id, sp.employee] : [id]);
    return { r, slips };
  });
  if (!X) notFound();
  const [y, m] = X.r.ps.split('-').map(Number);
  return (
    <div className="mx-auto max-w-[800px] bg-white p-4">
      <div className="no-print mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"><span className="font-bold">{X.slips.length} payslip{X.slips.length === 1 ? '' : 's'} · {MONTHS[m - 1]} {y}{X.r.status === 'draft' ? ' (draft, not yet approved)' : ''}</span><PrintButton label="Print" /></div>
      {X.slips.map((s: any) => <Payslip key={s.id} s={s} year={y} month={m} />)}
    </div>
  );
}
