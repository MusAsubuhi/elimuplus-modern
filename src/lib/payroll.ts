// Kenyan payroll arithmetic. Pure functions: rates come from the statutory_rates table (effective-dated), nothing is hard-coded here
// except the shape of the PAYE bands. Deductions before tax: NSSF, SHIF and the employee Housing Levy. Employer pays NSSF, Housing Levy and NITA on top.
export type RateRow = { key: string; value: number; effective_from: string };
export type Rates = Record<string, number>;

/** The rate in force on a date: for each key, the latest row whose effective_from is on or before it. */
export function ratesAt(rows: RateRow[], on: string): Rates {
  const best: Record<string, RateRow> = {};
  for (const r of rows) if (r.effective_from <= on && (!best[r.key] || r.effective_from > best[r.key].effective_from)) best[r.key] = r;
  return Object.fromEntries(Object.entries(best).map(([k, r]) => [k, Number(r.value)]));
}
export const money = (n: number) => Math.round(n * 100) / 100;

export function payeOn(taxable: number, r: Rates): number {
  const bands: [number, number][] = [[r.paye_b1_upper, r.paye_b1_rate], [r.paye_b2_upper, r.paye_b2_rate], [r.paye_b3_upper, r.paye_b3_rate], [r.paye_b4_upper, r.paye_b4_rate], [Infinity, r.paye_b5_rate]];
  let tax = 0, from = 0;
  for (const [upper, rate] of bands) {
    if (taxable > from) tax += (Math.min(taxable, upper) - from) * rate;
    from = upper;
  }
  return money(tax);
}

export function nssfOn(gross: number, r: Rates): { ee: number; er: number } {
  const pensionable = Math.min(Math.max(gross, 0), r.nssf_upper);
  const v = money(pensionable * r.nssf_rate); // tier 1 on the lower limit plus tier 2 on the rest is the same 6% of pensionable pay up to the upper limit
  return { ee: v, er: v };
}

export type PayInput = { basic: number; allowances: number; bonus?: number; otherDeduction?: number; daysWorked?: number; daysInMonth?: number };
export type Payslip = {
  basic: number; allowances: number; bonus: number; gross: number;
  nssf_ee: number; shif: number; housing_ee: number; taxable: number; paye_gross: number; relief: number; paye: number;
  other_deduction: number; net: number; nssf_er: number; housing_er: number; nita: number; employer_total: number; remit_total: number;
};

export function computePayslip(i: PayInput, r: Rates): Payslip {
  const f = i.daysInMonth && i.daysWorked != null ? Math.min(1, Math.max(0, i.daysWorked / i.daysInMonth)) : 1;
  const basic = money(i.basic * f), allowances = money(i.allowances * f), bonus = money(i.bonus ?? 0);
  const gross = money(basic + allowances + bonus);
  const n = nssfOn(gross, r);
  const shif = gross > 0 ? money(Math.max(gross * r.shif_rate, r.shif_min)) : 0;
  const housing_ee = money(gross * r.housing_rate), housing_er = housing_ee;
  const taxable = money(Math.max(0, gross - n.ee - shif - housing_ee));
  const paye_gross = payeOn(taxable, r);
  const relief = paye_gross > 0 ? Math.min(paye_gross, r.paye_personal_relief) : 0;
  const paye = money(paye_gross - relief);
  const other = money(i.otherDeduction ?? 0);
  const net = money(gross - n.ee - shif - housing_ee - paye - other);
  const nita = gross > 0 ? r.nita_per_employee : 0;
  return {
    basic, allowances, bonus, gross, nssf_ee: n.ee, shif, housing_ee, taxable, paye_gross, relief, paye,
    other_deduction: other, net, nssf_er: n.er, housing_er, nita,
    employer_total: money(n.er + housing_er + nita),
    remit_total: money(n.ee + n.er + shif + housing_ee + housing_er + paye + nita),
  };
}

export const daysInMonth = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
/** Calendar days an employee was employed within a month (start and exit dates inclusive). */
export function daysEmployed(ym: string, start: string, end: string | null): number {
  const dim = daysInMonth(ym), first = `${ym}-01`, last = `${ym}-${String(dim).padStart(2, '0')}`;
  const a = start > first ? start : first, b = end && end < last ? end : last;
  if (a > b) return 0;
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;
}
/** Statutory returns for the PAYE, NSSF, SHIF and Housing Levy are due by the 9th of the following month. */
export function remitDue(ym: string): string {
  const [y, m] = ym.split('-').map(Number); const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-09`;
}
// Statutory leave in Kenya's Employment Act: 21 working days' annual leave, 7 days paternity, 3 months maternity,
// 7 full-pay and 7 half-pay sick days a year after two months of service. Shown as guides; the contract can be more generous.
export const LEAVE_ENTITLEMENT: Record<string, number | null> = { annual: 21, sick: 14, maternity: 90, paternity: 14, compassionate: null, unpaid: null, study: null };
