// The books: the migrations run, the statements can be loaded from real tables, and the balance sheet balances.
// Run: npx tsx scripts/test-books.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { loadRaw, profitAndLoss, balanceSheet, workingCapital, receivablesSummary } from '../src/lib/books.ts';

const db = new PGlite();
await db.exec(`create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(coalesce(current_setting('request.jwt.claim.sub', true), current_setting('request.jwt.sub', true)),'')::uuid $$;
  create role authenticated; create role anon;`);
for (const f of readdirSync('supabase/migrations').filter((x) => /^00(0[1-9]|[1-9]\d)/.test(x) && x.endsWith('.sql')).sort()) {
  if (/^(0005|0011|0020a)/.test(f)) continue;
  try { await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8')); } catch (e) { if (!/already exists|does not exist/.test(String(e.message))) throw new Error(`${f}: ${e.message}`); }
}
await db.exec(readFileSync('supabase/seed.sql', 'utf8'));
const q = async (sql, p = []) => (await db.query(sql, p)).rows;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`); };

const raw = await loadRaw(q);
ok('chart of accounts is seeded with income, direct and overhead accounts', ['income', 'direct_cost', 'overhead'].every((k) => raw.accounts.some((a) => a.kind === k)));
ok('every expense category is linked to a cost account', (await q('select count(*)::int n from expense_categories where account_id is null'))[0].n === 0);
ok('bank, M-Pesa and cash accounts exist', raw.money.length === 3);

// A synthetic set of books with every kind of movement, started on 1 Nov 2026.
const R = {
  accounts: raw.accounts, start: '2026-11-01',
  money: [{ id: 'b', name: 'Bank', kind: 'bank', opening_kes: 50000 }, { id: 'm', name: 'M-Pesa', kind: 'mpesa', opening_kes: 12000 }, { id: 'c', name: 'Cash', kind: 'cash', opening_kes: 3000 }],
  invoices: [
    { id: 'i0', number: 'OLD-1', org: 'A', cohort_id: null, kind: 'training', issued_on: '2026-10-10', due_on: '2026-10-24', amount_kes: 40000 },
    { id: 'i1', number: 'NEW-1', org: 'B', cohort_id: 'c1', kind: 'training', issued_on: '2026-11-11', due_on: '2026-11-25', amount_kes: 19500 },
    { id: 'i2', number: 'NEW-2', org: 'B', cohort_id: 'c1', kind: 'followup', issued_on: '2026-11-20', due_on: '2026-12-04', amount_kes: 9000 },
  ],
  payments: [{ invoice_id: 'i0', amount_kes: 10000, method: 'bank', received_on: '2026-10-20' }, { invoice_id: 'i0', amount_kes: 15000, method: 'mpesa', received_on: '2026-11-05' }, { invoice_id: 'i1', amount_kes: 19500, method: 'mpesa', received_on: '2026-11-15' }],
  expenses: [
    { id: 'e0', cohort_id: null, account_id: raw.accounts.find((a) => a.code === '6200').id, amt: 4000, accrued_on: '2026-10-28', paid_on: '2026-11-03', paid_from: 'mpesa', reason: 'old ad' },
    { id: 'e1', cohort_id: 'c1', account_id: raw.accounts.find((a) => a.code === '5400').id, amt: 6500, accrued_on: '2026-11-06', paid_on: '2026-11-06', paid_from: 'cash', reason: 'lunch' },
    { id: 'e2', cohort_id: null, account_id: raw.accounts.find((a) => a.code === '6300').id, amt: 2500, accrued_on: '2026-11-10', paid_on: null, paid_from: 'to_be_paid', reason: 'software' },
  ],
  claims: [{ id: 'k1', cohort_id: 'c1', amt: 8000, accrued_on: '2026-11-12', paid_on: '2026-11-14', method: 'mpesa' }, { id: 'k2', cohort_id: 'c1', amt: 3000, accrued_on: '2026-11-18', paid_on: null, method: null }],
  trainerPayments: [], payroll: [],
  ledger: [
    { id: 'l1', entry_date: '2026-11-02', kind: 'capital_in', amount_kes: 20000, money_account_id: 'b', account_id: null, cohort_id: null },
    { id: 'l2', entry_date: '2026-11-08', kind: 'asset_purchase', amount_kes: 30000, money_account_id: 'b', account_id: null, cohort_id: null },
    { id: 'l3', entry_date: '2026-11-30', kind: 'depreciation', amount_kes: 1000, money_account_id: null, account_id: null, cohort_id: null },
    { id: 'l4', entry_date: '2026-11-09', kind: 'loan_in', amount_kes: 15000, money_account_id: 'm', account_id: null, cohort_id: null },
    { id: 'l5', entry_date: '2026-11-25', kind: 'drawings', amount_kes: 2000, money_account_id: 'b', account_id: null, cohort_id: null },
    { id: 'l6', entry_date: '2026-11-26', kind: 'other_income', amount_kes: 5000, money_account_id: 'm', account_id: null, cohort_id: null },
  ],
  opening: [{ id: 'o1', kind: 'equipment', label: 'Laptop', amount_kes: 45000 }, { id: 'o2', kind: 'loan', label: 'Loan', amount_kes: 10000 }, { id: 'o3', kind: 'capital', label: 'Capital', amount_kes: 60000 }],
  checks: [],
};
for (const on of ['2026-11-01', '2026-11-12', '2026-11-30', '2026-12-31']) {
  const bs = balanceSheet(R, on);
  ok(`balance sheet balances on ${on} (difference ${bs.difference})`, bs.difference === 0, `assets ${bs.totalAssets} vs ${bs.totalLiabilities + bs.equity}`);
}
const pl = profitAndLoss(R, '2026-11-01', '2026-11-30');
ok('revenue counts invoices issued in the period, not payments', pl.totalRevenue === 19500 + 9000 + 5000, String(pl.totalRevenue));
ok('costs count when incurred, paid or not (lunch + software + trainer claims + depreciation)', pl.totalDirect + pl.totalOverhead === 6500 + 2500 + 8000 + 3000 + 1000, String(pl.totalDirect + pl.totalOverhead));
ok('an October invoice and an October cost stay out of November profit', pl.revenue.every((l) => l.amount !== 40000) && !pl.overhead.some((l) => l.amount === 4000));
const c1 = profitAndLoss(R, '2026-11-01', '2026-11-30', 'c1'), gen = profitAndLoss(R, '2026-11-01', '2026-11-30', 'general');
ok('cohort and general views add up to the whole', c1.netProfit + gen.netProfit === pl.netProfit);
ok('general costs exclude cohort costs', gen.totalDirect === 0);
const rs = receivablesSummary(R, '2026-11-30');
ok('receivables are unpaid invoice balances', rs.total === 15000 + 9000, String(rs.total));
const wc = workingCapital(R, '2026-11-30');
ok('working capital is current assets less current liabilities', wc.workingCapital === wc.currentAssets - wc.currentLiabilities);
ok('outlook has 30, 60 and 90 day positions', wc.horizon.length === 3);
ok('support money is not in any statement', !JSON.stringify(pl).toLowerCase().includes('support'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
