// Payroll arithmetic against hand-worked cases. Run: npx tsx scripts/test-payroll.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { ratesAt, computePayslip, payeOn, daysEmployed, remitDue } from '../src/lib/payroll.ts';

const db = new PGlite();
await db.exec(`create schema app; create function app.is_founder() returns boolean language sql as $$ select true $$;
  create role authenticated; create table public.people(id uuid primary key);`);
await db.exec(readFileSync('supabase/migrations/0042_hr_payroll.sql', 'utf8'));
const rows = (await db.query('select key, value::float8 value, effective_from::text effective_from from statutory_rates')).rows;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  ' + x}`); };
const close = (a, b) => Math.abs(a - b) < 0.011;

const r26 = ratesAt(rows, '2026-11-30'), r25 = ratesAt(rows, '2025-06-30');
ok('2026 rates use NSSF year 4 limits', r26.nssf_lower === 9000 && r26.nssf_upper === 108000, JSON.stringify(r26));
ok('mid-2025 rates use NSSF year 3 limits', r25.nssf_upper === 72000);
ok('PAYE on 24,000 is 2,400', close(payeOn(24000, r26), 2400));
ok('PAYE on 32,333 is 4,483.25', close(payeOn(32333, r26), 4483.25), String(payeOn(32333, r26)));

// Gross 100,000: NSSF 6,000, SHIF 2,750, housing 1,500, taxable 89,750, PAYE before relief 21,708.35, after relief 19,308.35, net 70,441.65
const a = computePayslip({ basic: 100000, allowances: 0 }, r26);
ok('100,000: NSSF', close(a.nssf_ee, 6000)); ok('100,000: SHIF', close(a.shif, 2750)); ok('100,000: housing', close(a.housing_ee, 1500));
ok('100,000: taxable', close(a.taxable, 89750)); ok('100,000: PAYE', close(a.paye, 19308.35), String(a.paye)); ok('100,000: net', close(a.net, 70441.65), String(a.net));
ok('100,000: employer side NSSF 6,000 + housing 1,500 + NITA 50', close(a.employer_total, 7550));

// Gross 20,000: NSSF 1,200, SHIF 550, housing 300, taxable 17,950, tax 1,795 less relief 2,400 = 0
const b = computePayslip({ basic: 20000, allowances: 0 }, r26);
ok('20,000: relief wipes out PAYE', b.paye === 0 && close(b.net, 20000 - 1200 - 550 - 300), JSON.stringify(b));

// Gross 5,000: SHIF floor of 300 applies (2.75% = 137.50)
const c = computePayslip({ basic: 5000, allowances: 0 }, r26);
ok('5,000: SHIF minimum of 300', c.shif === 300);

// Gross 200,000: NSSF capped at 6,480
const d = computePayslip({ basic: 200000, allowances: 0 }, r26);
ok('200,000: NSSF capped at 6,480', close(d.nssf_ee, 6480), String(d.nssf_ee));

// Proration, bonus and a non-statutory deduction
const e = computePayslip({ basic: 60000, allowances: 6000, daysWorked: 15, daysInMonth: 30, bonus: 4000, otherDeduction: 1000 }, r26);
ok('proration halves basic and allowances', e.basic === 30000 && e.allowances === 3000 && e.gross === 37000);
ok('advance is taken after tax and reduces net only', close(e.net, e.gross - e.nssf_ee - e.shif - e.housing_ee - e.paye - 1000));
ok('gross = net + employee deductions + advance', close(d.gross, d.net + d.nssf_ee + d.shif + d.housing_ee + d.paye));
ok('cash out equals gross plus employer cost', close(a.net + a.remit_total, a.gross + a.employer_total), `${a.net + a.remit_total} vs ${a.gross + a.employer_total}`);

ok('joined mid-month: 1 Nov start in November is 30 days', daysEmployed('2026-11', '2026-11-01', null) === 30);
ok('joined 16 Nov: 15 days', daysEmployed('2026-11', '2026-11-16', null) === 15);
ok('left 10 Nov: 10 days', daysEmployed('2026-11', '2025-01-01', '2026-11-10') === 10);
ok('not yet started: 0 days', daysEmployed('2026-11', '2026-12-01', null) === 0);
ok('remittance due on the 9th of next month, across a year end', remitDue('2026-11') === '2026-12-09' && remitDue('2026-12') === '2027-01-09');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
