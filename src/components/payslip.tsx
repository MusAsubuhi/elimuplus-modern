const f2 = (n: number | string) => Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** One A4 payslip. Used by the founders' payroll print page and by the employee's own My pay page. */
export default function Payslip({ s, year, month }: { s: any; year: number; month: number }) {
  const Row = ({ a, b, bold }: { a: string; b: string; bold?: boolean }) => <tr className={bold ? 'border-t-2 border-slate-700 font-bold' : ''}><td className="py-0.5">{a}</td><td className="py-0.5 text-right tabular-nums">{b}</td></tr>;
  return (
    <section className="print-page text-[13px]">
      <div className="mb-3 flex items-end justify-between border-b-4 border-gold pb-2"><div><div className="text-xl font-black text-teal">Elimu+</div><div className="text-sm font-black">Payslip · {MONTHS[month - 1]} {year}</div></div><div className="text-right text-xs text-slate-500">Confidential</div></div>
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
  );
}
