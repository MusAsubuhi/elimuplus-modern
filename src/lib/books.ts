// Accrual-basis statements for Elimu+: profit and loss, balance sheet, working capital and receivables.
// Everything is worked out from records the portal already keeps (invoices, payments, expenses, trainer claims, payroll) plus what the
// founders enter once (books start date, money balances, opening items, a few ledger entries). Support money for participants is NOT here.
// Revenue is counted when an invoice is issued, a cost when it is approved or incurred, whether or not money has moved.
type Q = (sql: string, params?: any[]) => Promise<any[]>;

const iso = (x: any): string => (x instanceof Date ? x.toISOString().slice(0, 10) : String(x ?? '').slice(0, 10));
export const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
const addDays = (s: string, n: number) => { const x = new Date(s + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000);

export type Raw = {
  accounts: { id: string; code: string; name: string; kind: 'income' | 'direct_cost' | 'overhead'; active: boolean; is_system: boolean }[];
  money: { id: string; name: string; kind: 'bank' | 'mpesa' | 'cash'; opening_kes: number }[];
  start: string | null;
  invoices: { id: string; number: string; org: string; cohort_id: string | null; kind: string; issued_on: string; due_on: string; amount_kes: number }[];
  payments: { invoice_id: string; amount_kes: number; method: string; received_on: string }[];
  expenses: { id: string; cohort_id: string | null; account_id: string | null; amt: number; accrued_on: string; paid_on: string | null; paid_from: string; reason: string }[];
  claims: { id: string; cohort_id: string | null; amt: number; accrued_on: string; paid_on: string | null; method: string | null }[];
  trainerPayments: { cohort_id: string | null; amt: number; paid_on: string }[];
  ledger: { id: string; entry_date: string; kind: string; amount_kes: number; money_account_id: string | null; account_id: string | null; cohort_id: string | null; description: string | null }[];
  opening: { id: string; kind: string; label: string; amount_kes: number }[];
  checks: { money_account_id: string; checked_on: string; actual_kes: number }[];
  payroll: { period_end: string; gross: number; other: number; employer: number; net_paid_on: string | null; net: number; statutory_due: number; statutory_paid_on: string | null }[];
};

export async function loadRaw(q: Q): Promise<Raw> {
  const [accounts, money, set, invoices, payments, expenses, claims, tp, ledger, opening, checks] = await Promise.all([
    q('select id, code, name, kind, active, is_system from accounts order by code'),
    q('select id, name, kind, opening_kes::float8 opening_kes from money_accounts where active order by created_at, name'),
    q("select value from settings where key='books_start_date'"),
    q(`select i.id, i.number, o.name org, i.cohort_id, i.kind, i.issued_on, i.due_on, i.amount_kes from invoices i join organisations o on o.id=i.organisation_id`),
    q('select invoice_id, amount_kes, method, received_on from payments'),
    q(`select r.id, r.cohort_id, k.account_id, coalesce(r.paid_amount_kes, r.amount_kes) amt, r.reason, r.paid_from,
         coalesce(r.spent_on, r.decided_on, r.created_at::date) accrued_on,
         case when r.status in ('paid','reconciled') then coalesce(r.paid_on, r.spent_on, r.decided_on, r.created_at::date) end paid_on
       from expense_requests r left join expense_categories k on k.id=r.category_id where r.status in ('approved','paid','reconciled')`),
    q(`select k.id, k.cohort_id, k.amount_kes amt, coalesce(k.decided_on, k.created_at::date) accrued_on, po.paid_on, po.method
       from payout_claims k left join payout_items pi on pi.claim_id=k.id left join payouts po on po.id=pi.payout_id and po.status <> 'failed'
       where k.status in ('approved','paid')`),
    q('select cohort_id, amount_kes amt, paid_on from trainer_payments'),
    q('select id, entry_date, kind, amount_kes::float8 amount_kes, money_account_id, account_id, cohort_id, description from ledger_entries where voided_at is null'),
    q('select id, kind, label, amount_kes::float8 amount_kes from opening_items where voided_at is null order by created_at'),
    q('select distinct on (money_account_id) money_account_id, checked_on, actual_kes::float8 actual_kes from money_checks order by money_account_id, checked_on desc, created_at desc'),
  ]);
  const hasPayroll = (await q("select 1 from information_schema.tables where table_schema='public' and table_name='payroll_runs'")).length > 0;
  const payroll = !hasPayroll ? [] : await q(`select period_end, gross_kes::float8 gross, coalesce((select sum(other_deduction) from payslips s where s.run_id=payroll_runs.id),0)::float8 other, employer_kes::float8 employer, net_kes::float8 net, net_paid_on, statutory_kes::float8 statutory_due, statutory_paid_on
                           from payroll_runs where status in ('approved','paid')`);
  const n = <T extends Record<string, any>>(rows: T[], keys: string[]) => rows.map((r) => { const o: any = { ...r }; for (const k of keys) o[k] = o[k] ? iso(o[k]) : o[k] ?? null; return o; });
  return {
    accounts, money,
    start: set[0] ? iso(typeof set[0].value === 'string' ? set[0].value.replace(/"/g, '') : set[0].value) : null,
    invoices: n(invoices, ['issued_on', 'due_on']), payments: n(payments, ['received_on']),
    expenses: n(expenses, ['accrued_on', 'paid_on']), claims: n(claims, ['accrued_on', 'paid_on']), trainerPayments: n(tp, ['paid_on']),
    ledger: n(ledger, ['entry_date']), opening, checks: n(checks, ['checked_on']),
    payroll: n(payroll, ['period_end', 'net_paid_on', 'statutory_paid_on']),
  } as Raw;
}

const cashKind = (m: string | null | undefined) => (m === 'bank' || m === 'bank_transfer' || m === 'card' ? 'bank' : m === 'cash' ? 'cash' : 'mpesa');
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export type Line = { code: string; name: string; amount: number };
export type Pnl = {
  from: string; to: string; revenue: Line[]; direct: Line[]; overhead: Line[];
  totalRevenue: number; totalDirect: number; grossProfit: number; totalOverhead: number; netProfit: number;
};

export function startOf(raw: Raw): string {
  if (raw.start) return raw.start;
  const dates = [...raw.invoices.map((i) => i.issued_on), ...raw.expenses.map((e) => e.accrued_on), ...raw.ledger.map((l) => l.entry_date)].filter(Boolean).sort();
  return dates[0] ?? todayIso();
}

/** Profit and loss for a period. `cohort`: a cohort id for that cohort only, 'general' for costs not tied to a cohort, null for everything. */
export function profitAndLoss(raw: Raw, from: string, to: string, cohort: string | 'general' | null = null): Pnl {
  const inPeriod = (d: string | null) => !!d && d >= from && d <= to;
  const cohortOk = (c: string | null) => (cohort === null ? true : cohort === 'general' ? c === null : c === cohort);
  const acc = new Map(raw.accounts.map((a) => [a.id, a]));
  const byCode = new Map(raw.accounts.map((a) => [a.code, a]));
  const buckets = new Map<string, number>();
  const put = (code: string, amt: number) => buckets.set(code, (buckets.get(code) ?? 0) + amt);

  for (const i of raw.invoices) if (inPeriod(i.issued_on) && cohortOk(i.cohort_id)) put(i.kind === 'training' ? '4000' : i.kind === 'followup' ? '4100' : '4900', i.amount_kes);
  for (const l of raw.ledger) if (l.kind === 'other_income' && inPeriod(l.entry_date) && cohortOk(l.cohort_id)) put(l.account_id ? acc.get(l.account_id)?.code ?? '4900' : '4900', l.amount_kes);
  for (const e of raw.expenses) if (inPeriod(e.accrued_on) && cohortOk(e.cohort_id)) put(e.account_id ? acc.get(e.account_id)?.code ?? '6990' : '6990', e.amt);
  for (const c of raw.claims) if (inPeriod(c.accrued_on) && cohortOk(c.cohort_id)) put('5100', c.amt);
  for (const t of raw.trainerPayments) if (inPeriod(t.paid_on) && cohortOk(t.cohort_id)) put('5100', t.amt);
  for (const l of raw.ledger) if (l.kind === 'depreciation' && inPeriod(l.entry_date) && cohortOk(l.cohort_id)) put('6910', l.amount_kes);
  if (cohort === null || cohort === 'general') for (const p of raw.payroll) if (inPeriod(p.period_end)) { put('6100', p.gross - (p.other ?? 0)); put('6110', p.employer); }

  const mk = (kind: string): Line[] => [...buckets.entries()]
    .map(([code, amount]) => ({ code, name: byCode.get(code)?.name ?? code, amount, kind: byCode.get(code)?.kind }))
    .filter((x) => x.kind === kind && x.amount !== 0).sort((a, b) => a.code.localeCompare(b.code)).map(({ code, name, amount }) => ({ code, name, amount }));
  const revenue = mk('income'), direct = mk('direct_cost'), overhead = mk('overhead');
  const totalRevenue = sum(revenue.map((x) => x.amount)), totalDirect = sum(direct.map((x) => x.amount)), totalOverhead = sum(overhead.map((x) => x.amount));
  return { from, to, revenue, direct, overhead, totalRevenue, totalDirect, grossProfit: totalRevenue - totalDirect, totalOverhead, netProfit: totalRevenue - totalDirect - totalOverhead };
}

export function receivablesAt(raw: Raw, on: string) {
  const paid = new Map<string, number>();
  for (const p of raw.payments) if (p.received_on <= on) paid.set(p.invoice_id, (paid.get(p.invoice_id) ?? 0) + p.amount_kes);
  return raw.invoices.filter((i) => i.issued_on <= on).map((i) => ({ ...i, balance: i.amount_kes - (paid.get(i.id) ?? 0) })).filter((i) => i.balance > 0);
}
export function payablesAt(raw: Raw, on: string) {
  const exp = raw.expenses.filter((e) => e.accrued_on <= on && !(e.paid_on && e.paid_on <= on)).map((e) => ({ what: e.reason, amount: e.amt, since: e.accrued_on, kind: 'expense' as const }));
  const cl = raw.claims.filter((c) => c.accrued_on <= on && !(c.paid_on && c.paid_on <= on)).map((c) => ({ what: 'Trainer claim', amount: c.amt, since: c.accrued_on, kind: 'claim' as const }));
  return [...exp, ...cl];
}
const payrollOwedAt = (raw: Raw, on: string) => sum(raw.payroll.filter((p) => p.period_end <= on).map((p) => (p.net_paid_on && p.net_paid_on <= on ? 0 : p.net) + (p.statutory_paid_on && p.statutory_paid_on <= on ? 0 : p.statutory_due)));

export type BalanceSheet = ReturnType<typeof balanceSheet>;
export function balanceSheet(raw: Raw, on: string) {
  const start = startOf(raw);
  const dayBefore = addDays(start, -1);
  const flows = (m: Raw['money'][number]) => {
    const first = (kind: string) => raw.money.find((x) => x.kind === kind)?.id;
    const mine = (kind: string, accountId: string | null) => (accountId ? accountId === m.id : first(kind) === m.id);
    const inRange = (d: string | null) => !!d && d >= start && d <= on;
    let cash = m.opening_kes;
    for (const p of raw.payments) if (inRange(p.received_on) && first(cashKind(p.method)) === m.id) cash += p.amount_kes;
    for (const e of raw.expenses) if (inRange(e.paid_on) && first(cashKind(e.paid_from)) === m.id) cash -= e.amt;
    for (const c of raw.claims) if (inRange(c.paid_on) && first(cashKind(c.method)) === m.id) cash -= c.amt;
    for (const t of raw.trainerPayments) if (inRange(t.paid_on) && first('mpesa') === m.id) cash -= t.amt;
    for (const p of raw.payroll) {
      if (inRange(p.net_paid_on) && first('mpesa') === m.id) cash -= p.net;
      if (inRange(p.statutory_paid_on) && first('mpesa') === m.id) cash -= p.statutory_due;
    }
    for (const l of raw.ledger) {
      if (!inRange(l.entry_date) || !mine('bank', l.money_account_id)) continue;
      if (['capital_in', 'loan_in', 'other_income'].includes(l.kind)) cash += l.amount_kes;
      if (['drawings', 'loan_repaid', 'asset_purchase'].includes(l.kind)) cash -= l.amount_kes;
    }
    return cash;
  };
  const cashLines = raw.money.map((m) => ({ id: m.id, name: m.name, kind: m.kind, amount: flows(m) }));
  const cash = sum(cashLines.map((c) => c.amount));
  const recvRows = receivablesAt(raw, on), receivables = sum(recvRows.map((r) => r.balance));
  const open = (k: string) => sum(raw.opening.filter((o) => o.kind === k).map((o) => o.amount_kes));
  const inRangeL = (l: Raw['ledger'][number]) => l.entry_date >= start && l.entry_date <= on;
  const ledgerSum = (k: string) => sum(raw.ledger.filter((l) => l.kind === k && inRangeL(l)).map((l) => l.amount_kes));
  const equipment = open('equipment') + ledgerSum('asset_purchase') - ledgerSum('depreciation');
  const prepayments = open('prepayment'), otherAssets = open('other_asset');
  const payables = sum(payablesAt(raw, on).map((p) => p.amount));
  const payrollOwed = payrollOwedAt(raw, on);
  const loans = open('loan') + ledgerSum('loan_in') - ledgerSum('loan_repaid');
  const otherLiab = open('other_liability');
  const currentAssets = cash + receivables + prepayments + otherAssets;
  const currentLiabilities = payables + payrollOwed + otherLiab;
  const totalAssets = currentAssets + equipment;
  const totalLiabilities = currentLiabilities + loans;

  // Opening equity is what is left of the opening position after its liabilities; capital entered is shown separately from the rest.
  const openingCash = sum(raw.money.map((m) => m.opening_kes));
  const openingAssets = openingCash + sum(receivablesAt(raw, dayBefore).map((r) => r.balance)) + open('equipment') + open('prepayment') + open('other_asset');
  const openingLiab = sum(payablesAt(raw, dayBefore).map((p) => p.amount)) + open('loan') + open('other_liability');
  const openingEquity = openingAssets - openingLiab;
  const capitalEntered = open('capital') + ledgerSum('capital_in');
  const drawings = ledgerSum('drawings');
  const profit = profitAndLoss(raw, start, on).netProfit;
  const reserves = openingEquity - open('capital');
  const equity = openingEquity + ledgerSum('capital_in') - drawings + profit;
  const difference = Math.round(totalAssets - totalLiabilities - equity);
  return { on, start, cashLines, cash, receivables, recvRows, prepayments, otherAssets, equipment, currentAssets, totalAssets,
    payables, payrollOwed, otherLiab, currentLiabilities, loans, totalLiabilities,
    capital: capitalEntered, reserves, drawings, profit, equity, difference, openingEquity,
    checks: raw.money.map((m) => { const c = raw.checks.find((x) => x.money_account_id === m.id); const book = cashLines.find((x) => x.id === m.id)!.amount; return c ? { name: m.name, on: c.checked_on, actual: c.actual_kes, book, diff: c.actual_kes - book } : null; }).filter(Boolean) as { name: string; on: string; actual: number; book: number; diff: number }[] };
}

export function workingCapital(raw: Raw, on: string) {
  const bs = balanceSheet(raw, on);
  const wc = bs.currentAssets - bs.currentLiabilities;
  // average monthly running cost over the last 90 days, for a simple look ahead
  const from = addDays(on, -90);
  const p = profitAndLoss(raw, from, on);
  const monthlyCost = (p.totalDirect + p.totalOverhead) / 3;
  const horizon = [30, 60, 90].map((h) => {
    const limit = addDays(on, h);
    const inflow = sum(bs.recvRows.filter((r) => r.due_on <= limit).map((r) => r.balance));
    const outflow = bs.payables + bs.payrollOwed + monthlyCost * (h / 30);
    return { days: h, inflow, outflow, position: bs.cash + inflow - outflow };
  });
  return { ...bs, workingCapital: wc, currentRatio: bs.currentLiabilities ? bs.currentAssets / bs.currentLiabilities : null, monthlyCost, horizon };
}

export function receivablesSummary(raw: Raw, on: string) {
  const rows = receivablesAt(raw, on).map((r) => ({ ...r, overdueDays: Math.max(0, daysBetween(r.due_on, on)) })).sort((a, b) => b.overdueDays - a.overdueDays || a.due_on.localeCompare(b.due_on));
  const total = sum(rows.map((r) => r.balance));
  const overdue = sum(rows.filter((r) => r.overdueDays > 0).map((r) => r.balance));
  const buckets = [
    { label: 'Not yet due', amount: sum(rows.filter((r) => r.overdueDays === 0).map((r) => r.balance)) },
    { label: '1 to 30 days late', amount: sum(rows.filter((r) => r.overdueDays >= 1 && r.overdueDays <= 30).map((r) => r.balance)) },
    { label: '31 to 60 days late', amount: sum(rows.filter((r) => r.overdueDays >= 31 && r.overdueDays <= 60).map((r) => r.balance)) },
    { label: 'Over 60 days late', amount: sum(rows.filter((r) => r.overdueDays > 60).map((r) => r.balance)) },
  ];
  return { rows, total, overdue, buckets };
}

/** What signed quotations still have to be invoiced: money we expect, but which is not a receivable yet. */
export async function contractedNotInvoiced(q: Q) {
  const rows = await q(`select o.name org, c.name cohort,
      (select coalesce(sum(l.qty*l.unit_kes),0) from quote_lines l where l.quote_id=qt.id)::float8 quoted,
      (select coalesce(sum(i.amount_kes),0) from invoices i where i.quote_id=qt.id)::float8 invoiced
    from quotes qt join organisations o on o.id=qt.organisation_id left join cohorts c on c.id=qt.cohort_id where qt.status='signed'`);
  const items = rows.map((r) => ({ org: r.org as string, cohort: (r.cohort ?? '') as string, left: Math.max(0, r.quoted - r.invoiced) })).filter((r) => r.left > 0);
  return { items, total: sum(items.map((i) => i.left)) };
}
