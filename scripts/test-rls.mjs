// Runs the real migrations + seed in an in-process Postgres (PGlite) and checks who can see what.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
await db.exec(`
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(coalesce(current_setting('request.jwt.claim.sub', true), current_setting('request.jwt.sub', true)),'')::uuid $$;
  create role authenticated; create role anon;
`);
for (const f of ['0001_schema', '0002_rls', '0003_partner_aggregates']) await db.exec(readFileSync(`supabase/migrations/${f}.sql`, 'utf8'));
await db.exec(readFileSync('supabase/seed.sql', 'utf8'));
await db.exec(`
  insert into auth.users select id from public.people;
  update public.people set auth_user_id = id;
  grant usage on schema public, app, auth to authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant usage, select on all sequences in schema public to authenticated;
  grant execute on all functions in schema app to authenticated;
`);

const P = (n) => `00000000-0000-4000-8000-000000000${n}`;
const who = {
  founder: P(101), cofounder: P(102), master: P(201), tier2: P(202), tier1: P(203), tier1young: P(204),
  zawadi: P(301), rehema: P(302), amina: P(303), salim: P(306), ke358: P(401), school: P(402),
};
async function as(person, sql) {
  await db.exec(`reset role; set request.jwt.sub = '${who[person]}'; set role authenticated;`);
  try { return (await db.query(sql)).rows; } finally { await db.exec('reset role;'); }
}
async function asErr(person, sql) {
  try { await as(person, sql); return null; } catch (e) { return e.message; }
}
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + extra}`); };
const n = async (p, sql) => (await as(p, sql)).length;

// participants
ok('participant sees only own enrolment', (await n('zawadi', 'select 1 from enrolments')) === 1);
ok('participant sees own canvas answers only', (await n('zawadi', 'select 1 from canvas_answers')) === 5);
ok('participant cannot read session logs', (await n('zawadi', 'select 1 from session_logs')) === 0);
ok('participant cannot read other participant canvas', (await n('zawadi', `select 1 from canvases where id='${P(802)}'`)) === 0);
ok('participant cannot read finance', (await n('zawadi', 'select 1 from invoices')) + (await n('zawadi', 'select 1 from payments')) + (await n('zawadi', 'select 1 from expense_requests')) === 0);
ok('participant cannot read welfare flags or support ledger', (await n('zawadi', 'select 1 from welfare_flags')) + (await n('zawadi', 'select 1 from support_ledger')) === 0);
ok('participant cannot see follow-up visit notes of others', (await n('rehema', `select 1 from followup_visits where schedule_id in ('${P(901)}')`)) === 0);
ok('participant sees listed directory entries', (await n('amina', 'select 1 from directory_listings')) >= 1);
ok('participant cannot see other people', (await n('zawadi', 'select 1 from people')) === 1);

ok('participant can read own cohort and its organisation', (await n('zawadi', 'select 1 from cohorts')) === 1 && (await n('zawadi', 'select 1 from organisations')) === 1);

// facilitators
ok('tier2 sees own cohort logs', (await n('tier2', 'select 1 from session_logs')) === 1);
ok('tier1 co-facilitator sees cohort 1 enrolments only', (await n('tier1', 'select 1 from enrolments')) === 4);
ok('tier1young sees no cohorts', (await n('tier1young', 'select 1 from enrolments')) === 0);
ok('facilitator cannot see invoices/payments', (await n('tier2', 'select 1 from invoices')) + (await n('tier2', 'select 1 from payments')) === 0);
ok('facilitator sees only own expense requests', (await n('tier1', 'select 1 from expense_requests')) === 2);
ok('facilitator cannot approve expenses', (await asErr('tier1', `insert into expense_approvals(request_id,approver_id,decision) values('${P('d03')}','${who.tier1}','approve')`)) !== null);
ok('facilitator can file an expense request', (await asErr('tier1', `insert into expense_requests(requester_id,cohort_id,amount_kes,reason) values('${who.tier1}','${P(501)}',500,'test')`)) === null);
ok('facilitator cannot file for someone else', (await asErr('tier1', `insert into expense_requests(requester_id,amount_kes,reason) values('${who.tier2}',500,'spoof')`)) !== null);
ok('facilitator cannot read rate settings', (await n('tier1', 'select 1 from settings')) === 0);
ok('tier1 can raise welfare flag', (await asErr('tier1', `insert into welfare_flags(enrolment_id,raised_by,category,summary) values('${P(601)}','${who.tier1}','health','test')`)) === null);

// master trainer (tier 3/4)
ok('master trainer sees all cohorts', (await n('master', 'select 1 from cohorts')) === 2);
ok('master trainer sees facilitator pathway', (await n('master', 'select 1 from certifications')) === 4);
ok('master trainer cannot see finance', (await n('master', 'select 1 from invoices')) === 0);
ok('master trainer can review a report', (await asErr('master', `update reports set status='reviewed' where id='${P('e02')}'`)) === null);
ok('master trainer cannot release a report', (await asErr('master', `update reports set status='released' where id='${P('e02')}'`)) !== null);
ok('master trainer can nominate trainer candidate', (await asErr('master', `insert into invitations(full_name,contact,role,nominated_by) values('X','+254','trainer_candidate','${who.master}')`)) === null);
ok('tier1 cannot nominate trainer candidate', (await asErr('tier1', `insert into invitations(full_name,contact,role,nominated_by) values('X','+254','trainer_candidate','${who.tier1}')`)) !== null);

// partners
ok('KE358 admin sees own org tree', (await n('ke358', 'select 1 from organisations')) === 2);
ok('KE358 admin does not see school', (await n('ke358', `select 1 from organisations where id='00000000-0000-4000-8000-0000000000a3'`)) === 0);
ok('KE358 admin (named access) sees participants of its cohort', (await n('ke358', `select 1 from enrolments where cohort_id='${P(501)}'`)) === 4);
ok('school admin (aggregates only) sees no named enrolments', (await n('school', 'select 1 from enrolments')) === 0);
ok('partner never sees session logs', (await n('ke358', 'select 1 from session_logs')) === 0);
ok('partner sees released reports only', (await n('ke358', 'select 1 from reports')) === 2, JSON.stringify(await as('ke358', 'select title,status from reports')));
ok('partner does not see draft report', (await n('ke358', `select 1 from reports where status='draft'`)) === 0);
ok('parent org sees only types its agreement releases', (await n('ke358', `select 1 from reports where id='${P('e03')}'`)) === 1);
ok('school admin sees only own invoices', (await n('school', 'select 1 from invoices')) === 1);
ok('KE358 admin cannot see school invoices', (await n('ke358', `select 1 from invoices where organisation_id='00000000-0000-4000-8000-0000000000a3'`)) === 0);
ok('partner cannot see expense or support ledger', (await n('ke358', 'select 1 from expense_requests')) + (await n('ke358', 'select 1 from support_ledger')) === 0);
ok('KE358 admin sees welfare flags (agreement allows)', (await n('ke358', 'select 1 from welfare_flags')) >= 1);
ok('school admin sees no welfare flags', (await n('school', 'select 1 from welfare_flags')) === 0);
ok('school admin can request a cohort', (await asErr('school', `insert into cohorts(organisation_id,name,format,status) values('00000000-0000-4000-8000-0000000000a3','Cohort B','5-day','requested')`)) === null);
ok('school admin cannot create a confirmed cohort', (await asErr('school', `insert into cohorts(organisation_id,name,format,status) values('00000000-0000-4000-8000-0000000000a3','Cohort C','5-day','confirmed')`)) !== null);
ok('school admin can nominate participants', (await asErr('school', `insert into invitations(full_name,contact,role,organisation_id,nominated_by) values('Y','+254','participant','00000000-0000-4000-8000-0000000000a3','${who.school}')`)) === null);
ok('school admin cannot nominate facilitators', (await asErr('school', `insert into invitations(full_name,contact,role,organisation_id,nominated_by) values('Y','+254','facilitator','00000000-0000-4000-8000-0000000000a3','${who.school}')`)) !== null);

// partner aggregates: school has aggregates-only access, so it sees counts but no names or rows
ok('school admin gets cohort counts without enrolment rows', (await as('school', 'select enrolled from app.partner_cohort_counts()')).length >= 1 && (await n('school', 'select 1 from enrolments')) === 0);
ok('aggregate follow-up results carry no identifiers', Object.keys((await as('ke358', 'select * from app.partner_followup_results() limit 1'))[0] ?? {}).every((k) => !/person|name|enrol|id$/.test(k.replace('cohort_id',''))));
ok('partner cannot read raw follow-up visits', (await n('ke358', 'select 1 from followup_visits')) === 0);
ok('partner cannot see other partner follow-up results', (await as('school', "select 1 from app.partner_followup_results() where cohort_id='"+P(501)+"'")).length === 0);

// founders
ok('founder sees all payments', (await n('founder', 'select 1 from payments')) === 2);
ok('founder sees all expense requests', (await n('founder', 'select 1 from expense_requests')) >= 4);
ok('founder sees support ledger', (await n('founder', 'select 1 from support_ledger')) === 2);
ok('founder sees session logs', (await n('founder', 'select 1 from session_logs')) === 1);
ok('founder can approve another person’s request', (await asErr('founder', `insert into expense_approvals(request_id,approver_id,decision) values('${P('d03')}','${who.founder}','approve')`)) === null);
ok('co-founder can also approve (second approval)', (await asErr('cofounder', `insert into expense_approvals(request_id,approver_id,decision) values('${P('d04')}','${who.cofounder}','approve')`)) === null);
ok('founder cannot approve as someone else', (await asErr('founder', `insert into expense_approvals(request_id,approver_id,decision) values('${P('d04')}','${who.cofounder}','approve')`)) !== null);
await db.exec(`reset role; insert into expense_requests(id,requester_id,amount_kes,reason) values('${P('d05')}','${who.founder}',900,'founder own'); `);
ok('founder cannot approve own request', (await asErr('founder', `insert into expense_approvals(request_id,approver_id,decision) values('${P('d05')}','${who.founder}','approve')`)) !== null);
ok('founder can release a report', (await asErr('founder', `update reports set status='released' where id='${P('e02')}'`)) === null);
ok('founder reads audit log', (await asErr('founder', 'select 1 from audit_log')) === null);
ok('non-founder cannot read audit log', (await n('master', 'select 1 from audit_log')) === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
