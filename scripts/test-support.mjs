// Partner-recorded support: a partner records support for its own participants only, sees only its own entries, and founders still see and edit everything.
// Run: node scripts/test-support.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';

const db = new PGlite();
await db.exec(`create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(coalesce(current_setting('request.jwt.claim.sub', true), current_setting('request.jwt.sub', true)),'')::uuid $$;
  create role authenticated; create role anon;`);
for (const f of readdirSync('supabase/migrations').filter((x) => /^00(0[1-9]|[1-9]\d)/.test(x) && x.endsWith('.sql')).sort()) {
  if (/^(0005|0011|0020a)/.test(f)) continue;
  try { await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8')); } catch (e) { if (!/already exists|does not exist/.test(String(e.message))) throw new Error(`${f}: ${e.message}`); }
}
await db.exec(readFileSync('supabase/seed.sql', 'utf8'));
await db.exec(`
  create temp table _m as select id, gen_random_uuid() as aid from public.people;
  insert into auth.users select aid from _m;
  update public.people p set auth_user_id = m.aid from _m m where m.id = p.id;
  drop table _m;
  grant usage on schema public, app, auth to authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant usage, select on all sequences in schema public to authenticated;
  grant execute on all functions in schema app to authenticated;
`);
const P = (n) => `00000000-0000-4000-8000-000000000${n}`;
const who = { founder: P(101), ke358: P(401), school: P(402), zawadi: P(301) };
const O = { ke: P('0a2'), school: P('0a3') };
async function as(person, sql) {
  const aid = (await db.query('select auth_user_id from public.people where id = $1', [who[person]])).rows[0].auth_user_id;
  await db.exec(`reset role; set request.jwt.sub = '${aid}'; set role authenticated;`);
  try { return (await db.query(sql)).rows; } finally { await db.exec('reset role;'); }
}
const err = async (p, sql) => { try { await as(p, sql); return null; } catch (e) { return e.message; } };
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  -> ' + x}`); };

const ins = (p, enr, org, extra = '') => `insert into support_ledger(enrolment_id, entry_date, amount_kes, item, funder, source, given_by_org, recorded_by) values ('${enr}', '2026-11-01', 1500, 'Starter stock', 'Partner', 'partner', '${org}', '${who[p]}')${extra}`;

ok('partner can record support for a participant in its own cohort', (await err('ke358', ins('ke358', P(601), O.ke))) === null);
ok('partner cannot record support for another organisation’s participant', (await err('ke358', ins('ke358', P(605), O.ke))) !== null);
ok('partner cannot claim the other organisation as the giver', (await err('ke358', ins('ke358', P(605), O.school))) !== null);
ok('partner cannot record as someone else', (await err('ke358', `insert into support_ledger(enrolment_id, entry_date, amount_kes, item, source, given_by_org, recorded_by) values ('${P(601)}','2026-11-01',100,'x','partner','${O.ke}','${who.founder}')`)) !== null);
ok('partner cannot enter a founder-source row', (await err('ke358', `insert into support_ledger(enrolment_id, entry_date, amount_kes, item, source, recorded_by) values ('${P(601)}','2026-11-01',100,'x','founders','${who.ke358}')`)) !== null);
ok('partner cannot enter zero or negative amounts', (await err('ke358', ins('ke358', P(601), O.ke).replace('1500', '0'))) !== null);
ok('school partner records for its own participant', (await err('school', ins('school', P(605), O.school))) === null);
ok('partner sees only its own entries, not the founders’ rows or the other partner’s', (await as('ke358', 'select 1 from support_ledger')).length === 1);
ok('school sees only its own entry', (await as('school', 'select 1 from support_ledger')).length === 1);
ok('founder sees every row', (await as('founder', 'select 1 from support_ledger')).length === 4);
ok('participant sees none', (await as('zawadi', 'select 1 from support_ledger')).length === 0);
ok('partner can correct its own entry', (await as('ke358', `update support_ledger set amount_kes = 1800 where source='partner' returning 1`)).length === 1);
ok('partner cannot touch founder rows', (await as('ke358', `update support_ledger set amount_kes = 1 where source='founders' returning 1`)).length === 0);
ok('partner cannot move an entry to another organisation’s participant', (await err('ke358', `update support_ledger set enrolment_id='${P(605)}' where source='partner'`)) !== null);
ok('partner can remove its own entry only', (await as('ke358', `delete from support_ledger where source='partner' returning 1`)).length === 1 && (await as('founder', 'select 1 from support_ledger')).length === 3);
ok('founder can correct a partner-recorded row', (await as('founder', `update support_ledger set amount_kes = 2000 where source='partner' returning 1`)).length === 1);
ok('total across founders and partners is summed together', (await as('founder', 'select sum(amount_kes)::int s from support_ledger'))[0].s === 3000 + 2500 + 2000);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
