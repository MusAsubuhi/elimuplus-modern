import { computePayslip, daysEmployed, daysInMonth, ratesAt, type RateRow } from './payroll';

type Q = (sql: string, params?: any[]) => Promise<any[]>;

/** Rebuild every payslip of a draft run from current employees and rates, keeping any bonus or other deduction already typed in. */
export async function regenerate(q: Q, runId: string) {
  const run = (await q('select status, period_start::text ps, period_end::text pe from payroll_runs where id=$1', [runId]))[0];
  if (!run || run.status !== 'draft') throw new Error('Only a draft run can be recalculated.');
  const ym = String(run.ps).slice(0, 7);
  const rows = (await q('select key, value::float8 value, effective_from::text effective_from from statutory_rates')) as RateRow[];
  const rates = ratesAt(rows, String(run.pe).slice(0, 10));
  const keep = new Map<string, { bonus: number; other: number; note: string | null }>();
  for (const p of await q('select employee_id, bonus::float8 bonus, other_deduction::float8 other, other_note from payslips where run_id=$1', [runId])) keep.set(p.employee_id, { bonus: p.bonus, other: p.other, note: p.other_note });
  await q('delete from payslips where run_id=$1', [runId]);
  const emps = await q(`select id, start_date::text start_date, end_date::text end_date, basic_kes::float8 basic, allowances_kes::float8 allowances from employees
                        where start_date <= $2 and (end_date is null or end_date >= $1)`, [run.ps, run.pe]);
  const dim = daysInMonth(ym);
  for (const e of emps) {
    const worked = daysEmployed(ym, e.start_date, e.end_date);
    if (worked <= 0) continue;
    const k = keep.get(e.id);
    const s = computePayslip({ basic: e.basic, allowances: e.allowances, bonus: k?.bonus ?? 0, otherDeduction: k?.other ?? 0, daysWorked: worked, daysInMonth: dim }, rates);
    await q(`insert into payslips(run_id, employee_id, days_worked, days_in_month, basic, allowances, bonus, gross, nssf_ee, shif, housing_ee, taxable, paye_gross, relief, paye, other_deduction, other_note, net, nssf_er, housing_er, nita)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [runId, e.id, worked, dim, s.basic, s.allowances, s.bonus, s.gross, s.nssf_ee, s.shif, s.housing_ee, s.taxable, s.paye_gross, s.relief, s.paye, s.other_deduction, k?.note ?? null, s.net, s.nssf_er, s.housing_er, s.nita]);
  }
  await totals(q, runId);
}

export async function totals(q: Q, runId: string) {
  await q(`update payroll_runs r set
      gross_kes = coalesce(t.gross,0), net_kes = coalesce(t.net,0),
      employer_kes = coalesce(t.employer,0), statutory_kes = coalesce(t.statutory,0)
    from (select sum(gross) gross, sum(net) net, sum(nssf_er + housing_er + nita) employer,
                 sum(nssf_ee + shif + housing_ee + paye + nssf_er + housing_er + nita) statutory from payslips where run_id=$1) t
    where r.id=$1`, [runId]);
}
