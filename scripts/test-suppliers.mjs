// Suppliers, sourcing and founder to-dos: who can do what. Runs the real migrations + seed in an in-process Postgres (PGlite) and checks who can see what.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
await db.exec(`
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(coalesce(current_setting('request.jwt.claim.sub', true), current_setting('request.jwt.sub', true)),'')::uuid $$;
  create role authenticated; create role anon;
`);
for (const f of ['0001_schema', '0002_rls', '0003_partner_aggregates', '0004_function_search_path', '0006_team_suggestions_journey', '0007_levels_crm_reports_alerts', '0008_followup_forms', '0009_impact_data', '0010_form_registry', '0025_improvement_plans', '0026_trainer_payouts', '0027_report_exports', '0028_business_book', '0031_session_photos', '0032_session_photos_per_day', '0033_expense_records', '0034_suppliers_and_needs', '0035_sourcing_guard']) await db.exec(readFileSync(`supabase/migrations/${f}.sql`, 'utf8'));
await db.exec(readFileSync('supabase/seed.sql', 'utf8'));
await db.exec(`
  create temp table _auth_map as select id, gen_random_uuid() as aid from public.people;
  insert into auth.users select aid from _auth_map;
  update public.people p set auth_user_id = m.aid from _auth_map m where m.id = p.id;
  drop table _auth_map;
  grant usage on schema public, app, auth to authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant usage, select on all sequences in schema public to authenticated;
  grant execute on all functions in schema app to authenticated;
`);

const P = (n) => `00000000-0000-4000-8000-000000000${n}`;
const who = {
  founder: P(101), cofounder: P(102), master: P(201), tier2: P(202), tier1: P(203), tier1young: P(204), trainee: P(205),
  zawadi: P(301), rehema: P(302), amina: P(303), salim: P(306), ke358: P(401), school: P(402),
};
async function as(person, sql) {
  // Production identifies people by their login id, which differs from the profile id.
  const aid = (await db.query('select auth_user_id from public.people where id = $1', [who[person]])).rows[0].auth_user_id;
  await db.exec(`reset role; set request.jwt.sub = '${aid}'; set role authenticated;`);
  try { return (await db.query(sql)).rows; } finally { await db.exec('reset role;'); }
}
async function asErr(person, sql) {
  try { await as(person, sql); return null; } catch (e) { return e.message; }
}

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + extra}`); };
const ins = "insert into suppliers(name,categories,regions,status,suggested_by) values";
ok('a trainee can suggest a supplier', (await asErr('tier1', `${ins}('Kisumu Hall','{Venue}','{Kisumu}','suggested','${who.tier1}')`)) === null);
ok('a trainee cannot add an active supplier', (await asErr('tier1', `${ins}('Sneaky','{Venue}','{}','active','${who.tier1}')`)) !== null);
ok('a trainee cannot approve a supplier', (await as('tier1', "update suppliers set status='active' where name='Kisumu Hall' returning id")).length === 0);
ok('another trainer cannot see a suggestion', (await as('tier2', "select id from suppliers where name='Kisumu Hall'")).length === 0);
ok('the suggester can see their suggestion', (await as('tier1', "select id from suppliers where name='Kisumu Hall'")).length === 1);
ok('a founder sees the suggestion', (await as('founder', "select id from suppliers where name='Kisumu Hall'")).length === 1);
await as('founder', "update suppliers set status='active' where name='Kisumu Hall' returning id");
ok('after approval another trainer sees it', (await as('tier2', "select id from suppliers where name='Kisumu Hall'")).length === 1);
ok('a participant cannot see suppliers', (await as('zawadi', "select id from suppliers")).length === 0);
ok('a trainer can review a supplier', (await asErr('tier2', `insert into supplier_reviews(supplier_id,reviewer_id,price,quality,reliability) select id,'${who.tier2}',4,5,3 from suppliers where name='Kisumu Hall'`)) === null);
ok('a review needs scores 1 to 5', (await asErr('tier2', `insert into supplier_reviews(supplier_id,reviewer_id,price,quality,reliability) select id,'${who.tier2}',9,5,3 from suppliers where name='Kisumu Hall'`)) !== null);
await as('tier2', `insert into sourcing_needs(title,category,region,raised_by) values('Venue','Venue','Kisumu','${who.tier2}') returning id`);
await as('tier2', `insert into sourcing_quotes(need_id,supplier_id,amount_kes,added_by) select n.id,s.id,5000,'${who.tier2}' from sourcing_needs n, suppliers s where n.title='Venue' and s.name='Kisumu Hall' returning id`);
ok('the raiser can recommend', (await asErr('tier2', "update sourcing_needs set status='recommended', recommended_reason='close' where title='Venue'")) === null);
ok('the raiser cannot approve', (await asErr('tier2', "update sourcing_needs set status='selected' where title='Venue'")) !== null);
ok('the raiser cannot set the approved quote', (await asErr('tier2', "update sourcing_needs set selected_reason='x' where title='Venue'")) !== null);
ok('another trainer cannot add quotes to it', (await asErr('tier1', `insert into sourcing_quotes(need_id,supplier_id,added_by) select n.id,s.id,'${who.tier1}' from sourcing_needs n, suppliers s where n.title='Venue' and s.name='Kisumu Hall'`)) !== null);
ok('a founder can approve', (await asErr('founder', `update sourcing_needs set status='selected', selected_reason='best', decided_by='${who.founder}' where title='Venue'`)) === null);
ok('founder to-dos are private to founders', (await as('tier2', 'select id from founder_todos')).length === 0);
ok('a founder can add a to-do', (await asErr('founder', `insert into founder_todos(title,created_by) values('Reply to a partner','${who.founder}')`)) === null);
ok('a trainer cannot add a founder to-do', (await asErr('tier2', `insert into founder_todos(title,created_by) values('x','${who.tier2}')`)) !== null);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
