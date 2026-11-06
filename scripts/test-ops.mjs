// Sales, procurement, inventory, operations and compliance: dates, stock arithmetic and the attention counts. Run: npx tsx scripts/test-ops.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { nextDue, addDays, bookValue, watch } from '../src/lib/ops.ts';

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

ok('monthly from 31 Jan lands on 28 Feb', nextDue('2027-01-31', 'monthly') === '2027-02-28', nextDue('2027-01-31', 'monthly'));
ok('monthly across a year end', nextDue('2026-12-09', 'monthly') === '2027-01-09');
ok('quarterly', nextDue('2026-11-30', 'quarterly') === '2027-02-28');
ok('yearly from a leap day', nextDue('2028-02-29', 'yearly') === '2029-02-28');
ok('weekly and none', nextDue('2026-11-07', 'weekly') === '2026-11-14' && nextDue('2026-11-07', 'none') === null);
ok('addDays', addDays('2026-11-07', 30) === '2026-12-07');
ok('book value halves at half life', Math.abs(bookValue(100000, '2026-01-01', 4, '2028-01-01') - 50000) < 1500);
ok('book value never below zero', bookValue(100000, '2020-01-01', 3, '2026-11-07') === 0);

ok('compliance starter items are seeded', (await q('select count(*)::int n from compliance_items'))[0].n >= 6);
// stock: receive on a PO, issue to a cohort, count
const item = (await q(`insert into inventory_items(name, reorder_level) values ('Workbooks', 20) returning id`))[0].id;
const po = (await q(`insert into purchase_orders(po_no) values ('PO-2026-001') returning id`))[0].id;
await q(`insert into po_lines(po_id, item_id, description, qty, unit_price) values ($1,$2,'Workbooks',50,300)`, [po, item]);
const onHand = async () => Number((await q('select coalesce(sum(delta),0) n from stock_movements where item_id=$1', [item]))[0].n);
await q(`insert into stock_movements(item_id, delta, reason, po_id) values ($1, 50, 'received', $2)`, [item, po]);
await q(`insert into stock_movements(item_id, delta, reason) values ($1, -35, 'issued_to_cohort')`, [item]);
ok('stock on hand is receipts less issues', (await onHand()) === 15);
let w = await watch(q);
ok('15 on hand with reorder level 20 counts as low stock', w.lowStock === 1, JSON.stringify(w));
await q(`insert into stock_movements(item_id, delta, reason) values ($1, 40, 'received')`, [item]);
w = await watch(q);
ok('after restocking it is no longer low', w.lowStock === 0);
let bad = false; try { await q(`insert into stock_movements(item_id, delta, reason) values ($1, 0, 'used')`, [item]); } catch { bad = true; }
ok('a zero movement is rejected', bad);
ok('draft purchase order awaits approval', w.poApproval === 1);
await q(`insert into compliance_items(title, due_on) values ('Overdue thing', '2020-01-01')`);
await q(`insert into leads(name, next_on) values ('Church X', '2020-01-01')`);
await q(`insert into incidents(kind, description) values ('safety','test')`);
await q(`insert into data_requests(from_name, kind, due_on) values ('Someone','access', '2020-01-01')`);
w = await watch(q);
ok('overdue compliance, follow-up, incident and data request are counted', w.complianceOverdue === 1 && w.followUps === 1 && w.incidents === 1 && w.dataDue === 1, JSON.stringify(w));
ok('starter compliance items without dates are flagged', w.complianceNoDate >= 5);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
