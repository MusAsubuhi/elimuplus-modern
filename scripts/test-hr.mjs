// HR and payroll end to end: employees to a payroll run to the profit and loss and the balance sheet. Run: npx tsx scripts/test-hr.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { loadRaw, profitAndLoss, balanceSheet } from '../src/lib/books.ts';
import { regenerate } from '../src/lib/payroll-run.ts';

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
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  ' + x}`); };
const close = (a, b) => Math.abs(a - b) < 0.011;

await q(`insert into employees(full_name, job_title, department, employment_type, start_date, basic_kes, allowances_kes) values
  ('Full Month', 'Trainer', 'Programme', 'contract', '2026-01-05', 100000, 0),
  ('Joined Mid', 'Designer', 'Marketing', 'contract', '2026-11-16', 60000, 0),
  ('Left Early', 'Admin', 'Finance and admin', 'permanent', '2025-01-01', 30000, 0),
  ('Not Yet', 'Future', 'Other', 'intern', '2026-12-01', 20000, 0)`);
await q(`update employees set status='exited', end_date='2026-11-10' where full_name='Left Early'`);
const run = (await q(`insert into payroll_runs(period_start, period_end) values ('2026-11-01','2026-11-30') returning id`))[0].id;
await regenerate(q, run);
const slips = await q(`select e.full_name, s.* from payslips s join employees e on e.id=s.employee_id where run_id=$1 order by 1`, [run]);
ok('three people are on the November run (the future hire is not)', slips.length === 3, slips.map((s) => s.full_name).join());
const by = (n) => slips.find((s) => s.full_name === n);
ok('full month: 30 of 30 days and gross 100,000', by('Full Month').days_worked === 30 && close(+by('Full Month').gross, 100000));
ok('joined 16 Nov: 15 of 30 days, gross 30,000', by('Joined Mid').days_worked === 15 && close(+by('Joined Mid').gross, 30000));
ok('left 10 Nov: 10 of 30 days, gross 10,000', by('Left Early').days_worked === 10 && close(+by('Left Early').gross, 10000), String(by('Left Early').gross));
ok('full-month PAYE is 19,308.35', close(+by('Full Month').paye, 19308.35), String(by('Full Month').paye));

// An advance typed on a line survives a recalculation and only changes net.
await q(`update payslips set other_deduction=2000, other_note='advance' where id=$1`, [by('Full Month').id]);
await regenerate(q, run);
const again = (await q(`select s.* from payslips s join employees e on e.id=s.employee_id where run_id=$1 and e.full_name='Full Month'`, [run]))[0];
ok('advance kept after recalculation and taken from net', close(+again.other_deduction, 2000) && close(+again.net, 70441.65 - 2000), String(again.net));

const t = (await q('select gross_kes::float8 g, net_kes::float8 n, employer_kes::float8 e, statutory_kes::float8 s from payroll_runs where id=$1', [run]))[0];
const sum = (k) => slips.reduce((a, s) => a + Number(s[k]), 0);
ok('run gross equals the sum of payslips', close(t.g, (await q('select sum(gross)::float8 x from payslips where run_id=$1', [run]))[0].x));
ok('net + statutory = gross + employer cost less advances recovered (all cash out)', close(t.n + t.s, t.g + t.e - 2000), `${t.n + t.s} vs ${t.g + t.e - 2000}`);

// Draft runs are invisible to the books; approved ones appear in the P&L and as money owed.
let raw = await loadRaw(q);
ok('draft payroll is not in the books', raw.payroll.length === 0);
await q(`update payroll_runs set status='approved' where id=$1`, [run]);
raw = await loadRaw(q);
raw.start = '2026-11-01';
const pl = profitAndLoss(raw, '2026-11-01', '2026-11-30');
const code = (c) => pl.overhead.find((l) => l.code === c)?.amount ?? 0;
ok('P&L shows gross pay under 6100, less advances recovered (those were a cost when given)', close(code('6100'), t.g - 2000), String(code('6100')));
ok('P&L shows employer contributions under 6110', close(code('6110'), t.e), String(code('6110')));
let bs = balanceSheet(raw, '2026-11-30');
ok('balance sheet still balances with payroll owed', bs.difference === 0, String(bs.difference));
ok('payroll owed equals net plus statutory', close(bs.payrollOwed, t.n + t.s), String(bs.payrollOwed));
await q(`update payroll_runs set net_paid_on='2026-11-30', statutory_paid_on='2026-12-05', status='paid' where id=$1`, [run]);
raw = await loadRaw(q); raw.start = '2026-11-01';
bs = balanceSheet(raw, '2026-11-30');
ok('after paying staff, only the statutory part is still owed at 30 Nov', close(bs.payrollOwed, t.s), String(bs.payrollOwed));
bs = balanceSheet(raw, '2026-12-31');
ok('after both are paid nothing is owed and it balances', close(bs.payrollOwed, 0) && bs.difference === 0, `${bs.payrollOwed} ${bs.difference}`);

await q(`update payroll_runs set status='void' where id=$1`, [run]);
raw = await loadRaw(q);
ok('a voided run leaves the books', raw.payroll.length === 0);
let dupe = false; try { await q(`insert into payroll_runs(period_start, period_end) values ('2026-11-01','2026-11-30')`); await q(`insert into payroll_runs(period_start, period_end) values ('2026-11-01','2026-11-30')`); } catch { dupe = true; }
ok('only one live run per month', dupe);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
