import { notFound } from 'next/navigation';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import PrintButton from '@/components/print-button';

const f2 = (n: number) => Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
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
  const Row = ({ a, b, bold }: { a: string; b: string; bold?: boolean }) => <tr className={bold ? 'border-t-2 border-slate-700 font-bold' : ''}><td className="py-0.5">{a}</td><td className="py-0.5 text-right tabular-nums">{b}</td></tr>;
  return (
    <div className="mx-auto max-w-[800px] bg-white p-4">
      <div className="no-print mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"><span className="font-bold">{X.slips.length} payslip{X.slips.length === 1 ? '' : 's'} · {MONTHS[m - 1]} {y}{X.r.status === 'draft' ? ' (draft, not yet approved)' : ''}</span><PrintButton label="Print" /></div>
      {X.slips.map((s: any) => (
        <section key={s.id} className="print-page text-[13px]">
          <div className="mb-3 flex items-end justify-between border-b-4 border-gold pb-2"><div><div className="text-xl font-black text-teal">Elimu+</div><div className="text-sm font-black">Payslip · {MONTHS[m - 1]} {y}</div></div><div className="text-right text-xs text-slate-500">Confidential</div></div>
          <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px]">
            <div><b>Name:</b> {s.full_name}</div><div><b>Role:</b> {s.job_title}</div><div><b>KRA PIN:</b> {s.kra_pin ?? ''}</div><div><b>NSSF no:</b> {s.nssf_no ?? ''}</div><div><b>SHA no:</b> {s.sha_no ?? ''}</div><div><b>Days paid:</b> {s.days_worked} of {s.days_in_month}</div>
          </div>
          <table className="w-full"><tbody>
            <Row a="Basic pay" b={f2(s.basic)} /><Row a="Allowances" b={f2(s.allowances)} />{Number(s.bonus) > 0 && <Row a="Bonus" b={f2(s.bonus)} />}
            <Row bold a="Gross pay" b={f2(s.gross)} />
            <tr><td colSpan={2} className="pt-3 text-xs font-bold uppercase text-slate-500">Deductions before tax</td></tr>
            <Row a="NSSF (employee)" b={f2(s.nssf_ee)} /><Row a="SHIF" b={f2(s.shif)} /><Row a="Affordable Housing Levy (employee)" b={f2(s.housing_ee)} />
            <Row bold a="Taxable pay" b={f2(s.taxable)} />
            <Row a="PAYE before relief" b={f2(s.paye_gross)} /><Row a="Personal relief" b={`(${f2(s.relief)})`} /><Row bold a="PAYE" b={f2(s.paye)} />
            {Number(s.other_deduction) > 0 && <Row a={`Other deduction${s.other_note ? `: ${s.other_note}` : ''}`} b={f2(s.other_deduction)} />}
            <Row bold a="NET PAY" b={`KES ${f2(s.net)}`} />
          </tbody></table>
          <p className="mt-3 text-[11px] text-slate-600">Paid by Elimu+ on top of your pay, not deducted from you: NSSF {f2(s.nssf_er)}, Affordable Housing Levy {f2(s.housing_er)}, NITA {f2(s.nita)}.{s.pay_to ? ` Paid to: ${s.pay_to}.` : ''}</p>
        </section>
      ))}
    </div>
  );
}
