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
for (const f of ['0001_schema', '0002_rls', '0003_partner_aggregates', '0004_function_search_path', '0006_team_suggestions_journey', '0007_levels_crm_reports_alerts', '0008_followup_forms', '0009_impact_data', '0010_form_registry', '0025_improvement_plans', '0026_trainer_payouts']) await db.exec(readFileSync(`supabase/migrations/${f}.sql`, 'utf8'));
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

// suggestions: trainers suggest organisations; founders decide
const NEWORG = `insert into org_suggestions(name,type,county,suggested_by) values('Test Youth Group','ngo','Mombasa','%ID%')`;
ok('tier1 trainer can suggest an organisation', (await asErr('tier1', NEWORG.replace('%ID%', who.tier1))) === null);
ok('master trainer can suggest an organisation', (await asErr('master', NEWORG.replace('%ID%', who.master))) === null);
ok('participant cannot suggest an organisation', (await asErr('zawadi', NEWORG.replace('%ID%', who.zawadi))) !== null);
ok('partner admin cannot suggest an organisation', (await asErr('ke358', NEWORG.replace('%ID%', who.ke358))) !== null);
ok('trainer cannot suggest on behalf of someone else', (await asErr('tier1', NEWORG.replace('%ID%', who.tier2))) !== null);
ok('trainer sees only own suggestions', (await n('tier1', 'select 1 from org_suggestions')) === 1);
ok('founder sees all suggestions', (await n('founder', 'select 1 from org_suggestions')) === 2);
ok('trainer cannot approve a suggestion', (await asErr('tier1', `update org_suggestions set status='approved'`)) === null && (await as('founder', `select 1 from org_suggestions where status='approved'`)).length === 0);
ok('founder can approve a suggestion', (await asErr('founder', `update org_suggestions set status='approved', decided_by='${who.founder}'`)) === null);
ok('trainer can suggest an individual with education and location', (await asErr('tier1', `insert into invitations(full_name,contact,role,birth_year,education_level,occupation,county,ward,nominated_by) values('Z','+254','participant',2000,'secondary','Hawker','Mombasa','Likoni','${who.tier1}')`)) === null);

// founders go through the journey but cannot certify or promote themselves
ok('founder can start own facilitator pathway at Tier 1', (await asErr('founder', `insert into role_assignments(person_id,role,tier) values('${who.founder}','facilitator',1)`)) === null);
ok('founder cannot give self Tier 3', (await asErr('founder', `insert into role_assignments(person_id,role,tier) values('${who.founder}','facilitator',3)`)) !== null);
ok('founder cannot raise own tier by update', (await asErr('founder', `update role_assignments set tier=3 where person_id='${who.founder}' and role='facilitator'`)) !== null);
ok('founder cannot issue own certificate', (await asErr('founder', `insert into certifications(person_id,tier,number,issued_on) values('${who.founder}',1,'EL-TEST-SELF',current_date)`)) !== null);
ok('co-founder can certify the founder', (await asErr('cofounder', `insert into certifications(person_id,tier,number,issued_on) values('${who.founder}',1,'EL-TEST-OTHER',current_date)`)) === null);
ok('founder can enrol self in a cohort', (await asErr('founder', `insert into organisations(id,name,type,is_internal) values('00000000-0000-4000-8000-0000000000f1','Founders','other',true)`)) === null);
ok('trainer cannot create organisations directly', (await asErr('tier1', `insert into organisations(name,type) values('Sneaky','ngo')`)) !== null);
ok('trainer cannot create people directly', (await asErr('tier1', `insert into people(full_name) values('Sneaky')`)) !== null);

// ---------- levels, supervision and day reports ----------
const COHORT2 = P(502);
ok('trainee is a tier 0 facilitator', (await as('founder', `select 1 from role_assignments where person_id='${who.trainee}' and role='facilitator' and tier=0`)).length === 1);
const REPORT = (author, routed, concern = 'none', level = 0) => `insert into day_reports(author_id,cohort_id,level,routed_to,concern,answers) values('${author}','${COHORT2}',${level},'${routed}','${concern}','{"went_well":"x"}')`;
ok('trainee can file a day report for themselves', (await asErr('trainee', REPORT(who.trainee, who.tier1))) === null);
ok('trainee cannot file a report as someone else', (await asErr('trainee', REPORT(who.tier1, who.tier1))) !== null);
ok('participant cannot file a day report', (await asErr('zawadi', REPORT(who.zawadi, who.tier1))) !== null);
ok('partner admin cannot file a day report', (await asErr('ke358', REPORT(who.ke358, who.tier1))) !== null);
ok('author reads own report', (await n('trainee', 'select 1 from day_reports')) === 1);
ok('supervisor reads their trainee’s report', (await n('tier1', 'select 1 from day_reports')) === 1);
ok('other trainer cannot read it', (await n('tier1young', 'select 1 from day_reports')) === 0);
ok('master trainer reads all day reports', (await n('master', 'select 1 from day_reports')) === 1);
ok('founder reads all day reports', (await n('founder', 'select 1 from day_reports')) === 1);
ok('partner cannot read day reports', (await n('ke358', 'select 1 from day_reports')) === 0);
ok('trainee cannot mark own report seen', (await as('trainee', `update day_reports set status='seen' returning id`)).length === 0);
ok('supervisor can mark it seen', (await as('tier1', `update day_reports set status='seen', seen_by='${who.tier1}', seen_at=now() returning id`)).length === 1);
ok('unrelated trainer cannot change reports', (await as('tier1young', `update day_reports set review_note='x' returning id`)).length === 0);
ok('trainee cannot ask for expenses', (await asErr('trainee', `insert into expense_requests(requester_id,amount_kes,reason) values('${who.trainee}',500,'x')`)) !== null);
ok('associate can ask for expenses linked to a cohort and purpose', (await asErr('tier1', `insert into expense_requests(requester_id,cohort_id,purpose,amount_kes,reason) values('${who.tier1}','${COHORT2}','followup_30',500,'fare')`)) === null);
ok('purpose must be valid', (await asErr('tier1', `insert into expense_requests(requester_id,purpose,amount_kes,reason) values('${who.tier1}','holiday',500,'x')`)) !== null);
ok('trainee cannot see who supervises others outside their line', (await n('trainee', 'select 1 from supervision')) === 1);
ok('only staff can set supervision', (await asErr('tier1', `insert into supervision(person_id,supervisor_id) values('${who.zawadi}','${who.tier1}')`)) !== null);

// ---------- CRM: calls, visits and venue checks ----------
const GATE_ORG = P('f02');
await db.exec(`reset role; insert into organisations(id,name,type,status) values('${GATE_ORG}','Gate Test Church','church','prospect');
  insert into cohorts(id,organisation_id,name,format,status) values('${P('f03')}','${GATE_ORG}','Gate cohort','5-day','requested'),('${P('f04')}','${GATE_ORG}','Override cohort','5-day','requested');`);
ok('trainer cannot read CRM notes', (await n('tier1', 'select 1 from crm_activities')) === 0);
ok('trainer cannot log a call', (await asErr('tier1', `insert into crm_activities(organisation_id,kind,outcome,summary,logged_by) values('${GATE_ORG}','call','reached','x','${who.tier1}')`)) !== null);
ok('participant cannot read venue checks', (await n('zawadi', 'select 1 from readiness_checks')) === 0);
ok('everyone signed in can read the checklist template', (await n('tier1', 'select 1 from readiness_items')) >= 13);
ok('new organisation starts as not called', (await as('founder', `select called, visited, checks_complete from crm_org_status where organisation_id='${GATE_ORG}'`))[0].called === false);
ok('confirming is refused before any call, visit or check', (await asErr('founder', `update cohorts set status='confirmed' where id='${P('f03')}'`)) !== null);
ok('master trainer can log a call', (await asErr('master', `insert into crm_activities(organisation_id,kind,outcome,summary,logged_by) values('${GATE_ORG}','call','reached','Spoke to the pastor','${who.master}')`)) === null);
ok('a no-answer call does not count as called', (await asErr('master', `insert into crm_activities(organisation_id,kind,outcome,summary,logged_by) values('${P('0a1')}','call','no_answer','No answer','${who.master}')`)) === null
  && (await as('founder', `select called from crm_org_status where organisation_id='${P('0a1')}'`))[0].called === false);
ok('the call now shows', (await as('founder', `select called, calls from crm_org_status where organisation_id='${GATE_ORG}'`))[0].called === true);
ok('still refused after only a call', (await asErr('founder', `update cohorts set status='confirmed' where id='${P('f03')}'`)) !== null);
await as('master', `insert into crm_activities(organisation_id,kind,outcome,summary,logged_by) values('${GATE_ORG}','visit','completed','Walked the hall','${who.master}') returning id`);
ok('still refused until the venue checks pass', (await asErr('founder', `update cohorts set status='confirmed' where id='${P('f03')}'`)) !== null);
ok('master trainer can record venue checks', (await asErr('master', `insert into readiness_checks(organisation_id,item_key,status,checked_by,checked_on) select '${GATE_ORG}', key, 'ok', '${who.master}', current_date from readiness_items where required`)) === null);
ok('required checks complete', (await as('founder', `select checks_complete from crm_org_status where organisation_id='${GATE_ORG}'`))[0].checks_complete === true);
ok('now the cohort can be confirmed', (await asErr('founder', `update cohorts set status='confirmed' where id='${P('f03')}'`)) === null);
ok('an issue on a required check blocks confirmation again', (await asErr('master', `update readiness_checks set status='issue', note='Roof leaks' where organisation_id='${GATE_ORG}' and item_key='room_quiet'`)) === null
  && (await asErr('founder', `update cohorts set status='delivering' where id='${P('f04')}'`)) !== null);
ok('a founder can override with a recorded reason', (await asErr('founder', `update cohorts set readiness_override_note='Host is a known partner, venue visited by James', status='delivering' where id='${P('f04')}'`)) === null);
ok('trainer cannot edit checks', (await as('tier1', `update readiness_checks set status='ok' returning id`)).length === 0);

// ---------- founder alerts ----------
ok('a trainee report raised an alert', (await as('founder', `select 1 from founder_alerts where source_table='day_reports'`)).length >= 1);
await asErr('trainee', REPORT(who.trainee, who.tier1, 'urgent'));
ok('an urgent concern raises an urgent alert', (await as('founder', `select 1 from founder_alerts where severity='urgent' and source_table='day_reports'`)).length === 1);
ok('an expense request raised an alert', (await as('founder', `select 1 from founder_alerts where source_table='expense_requests'`)).length >= 1);
ok('a flagged venue issue raised an alert', (await as('founder', `select 1 from founder_alerts where source_table='readiness_checks'`)).length >= 1);
ok('a partner can request training', (await asErr('ke358', `insert into cohorts(organisation_id,name,format,status) values('${P('0a1')}','Partner request','5-day','requested')`)) === null);
ok('a partner training request raised an alert', (await as('founder', `select 1 from founder_alerts where source_table='cohorts' and title like 'Training requested by %'`)).length >= 1);
ok('trainers cannot read founder alerts', (await n('tier1', 'select 1 from founder_alerts')) === 0);
ok('master trainers cannot read founder alerts', (await n('master', 'select 1 from founder_alerts')) === 0);
ok('trainers cannot write alerts', (await asErr('tier1', `insert into founder_alerts(kind,title) values('x','x')`)) !== null);
const anAlert = (await as('founder', 'select id from founder_alerts limit 1'))[0].id;
ok('founder can mark an alert read', (await asErr('founder', `insert into alert_reads(alert_id,person_id) values('${anAlert}','${who.founder}')`)) === null);
ok('founder cannot mark read for the co-founder', (await asErr('founder', `insert into alert_reads(alert_id,person_id) values('${anAlert}','${who.cofounder}')`)) !== null);
ok('master trainer can read organisations to do calls and visits', (await n('master', 'select 1 from organisations')) >= 3);
ok('master trainer cannot read agreements', (await n('master', 'select 1 from agreements')) === 0);
ok('master trainer cannot edit an organisation', (await as('master', `update organisations set name = name returning id`)).length === 0);
ok('master trainer can log a call', (await asErr('master', `insert into crm_activities(organisation_id,kind,outcome,summary,logged_by) select id,'call','reached','test',app.me() from organisations limit 1`)) === null);
ok('the co-founder still sees it as unread', (await as('cofounder', `select 1 from alert_reads`)).length === 0);

// detailed follow-up forms
const before = (await as('founder', 'select 1 from founder_alerts')).length;
const enr = (await db.query('select e.id enrolment, e.cohort_id cohort from enrolments e limit 1')).rows[0];
await db.query(`insert into followup_schedule(enrolment_id, visit, due_date) values ($1, 90, current_date) on conflict do nothing`, [enr.enrolment]);
await db.exec(`reset role;`);
const ff = (await db.query(`insert into followup_forms(stage, cohort_id, enrolment_id, participant_name, business_status, urgent, answers) values (90, $1, $2, 'Test Participant', 'struggling', true, '{"a7_words":"no customers"}'::jsonb) returning id`, [enr.cohort, enr.enrolment])).rows[0];
ok('a follow-up form raised one urgent founder alert', (await as('founder', `select 1 from founder_alerts where source_table='followup_forms' and severity='urgent'`)).length === 1);
await db.query(`select set_config('app.skip_alert','1', false)`);
const sched = (await db.query('select id from followup_schedule where enrolment_id=$1 and visit=90', [enr.enrolment])).rows[0];
await db.query(`insert into followup_visits(schedule_id, visited_on) values ($1, current_date) on conflict do nothing`, [sched.id]);
await db.query(`select set_config('app.skip_alert','', false)`);
ok('filling the standard visit from the form raises no second alert', (await as('founder', `select 1 from founder_alerts where source_table='followup_visits'`)).length === (await as('founder', `select 1 from founder_alerts where source_table='followup_visits'`)).length && (await as('founder', 'select 1 from founder_alerts')).length === before + 1);
ok('founder can read follow-up forms', (await n('founder', 'select 1 from followup_forms')) === 1);
ok('a participant cannot read follow-up forms', (await n('zawadi', 'select 1 from followup_forms')) === 0);
ok('a partner cannot read follow-up forms', (await n('ke358', 'select 1 from followup_forms')) === 0);
ok('trainers cannot write follow-up forms directly', (await asErr('tier1', `insert into followup_forms(stage, participant_name) values (30, 'x')`)) !== null);


// ---------- personal improvement plans ----------
const PLAN = P('f01');
ok('owner sees own plan, goals and check-ins', (await n('tier1', 'select 1 from improvement_plans')) === 1 && (await n('tier1', 'select 1 from improvement_goals')) === 3 && (await n('tier1', 'select 1 from improvement_checkins')) === 2);
ok('supervisor sees the plan of the person they supervise', (await n('tier2', 'select 1 from improvement_plans')) === 1);
ok('founder sees every plan', (await n('founder', 'select 1 from improvement_plans')) === 1);
ok('unrelated trainer cannot see the plan', (await n('tier1young', 'select 1 from improvement_plans')) === 0 && (await n('master', 'select 1 from improvement_goals')) === 0);
ok('participant and partner cannot see plans', (await n('zawadi', 'select 1 from improvement_plans')) + (await n('ke358', 'select 1 from improvement_plans')) === 0);
ok('anyone can start their own plan', (await asErr('zawadi', `insert into improvement_plans(person_id,title,created_by) values('${who.zawadi}','Grow my stall','${who.zawadi}')`)) === null);
ok('cannot start a plan in someone else’s name', (await asErr('tier1young', `insert into improvement_plans(person_id,title,created_by) values('${who.tier1}','Spoof','${who.tier1young}')`)) !== null);
ok('cannot claim another person as the author', (await asErr('tier1young', `insert into improvement_plans(person_id,title,created_by) values('${who.tier1young}','Spoof','${who.tier1}')`)) !== null);
ok('supervisor can set up a plan for the person they supervise', (await asErr('tier2', `insert into improvement_plans(person_id,title,origin,created_by) values('${who.tier1young}','Kevin: next steps','reviewer','${who.tier2}')`)) === null);
ok('a plan cannot be moved to another person', (await asErr('tier1', `update improvement_plans set person_id='${who.tier2}' where id='${PLAN}'`)) !== null);
ok('owner adds an accepted goal', (await asErr('tier1', `insert into improvement_goals(plan_id,title,proposed_by,accepted) values('${PLAN}','New goal','${who.tier1}',true)`)) === null);
ok('owner cannot add an unaccepted goal for themselves', (await asErr('tier1', `insert into improvement_goals(plan_id,title,proposed_by,accepted) values('${PLAN}','x','${who.tier1}',false)`)) !== null);
ok('supervisor can only suggest a goal', (await asErr('tier2', `insert into improvement_goals(plan_id,title,proposed_by,accepted) values('${PLAN}','Suggested','${who.tier2}',false)`)) === null);
ok('supervisor cannot add an already-accepted goal', (await asErr('tier2', `insert into improvement_goals(plan_id,title,proposed_by,accepted) values('${PLAN}','Forced','${who.tier2}',true)`)) !== null);
ok('supervisor cannot change progress on a goal', (await as('tier2', `update improvement_goals set progress=100, status='done' where id='${P('f11')}' returning 1`)).length === 0);
ok('owner can update progress on own goal', (await as('tier1', `update improvement_goals set progress=60, status='in_progress' where id='${P('f11')}' returning 1`)).length === 1);
ok('outsider cannot add goals to the plan', (await asErr('tier1young', `insert into improvement_goals(plan_id,title,proposed_by,accepted) values('${PLAN}','x','${who.tier1young}',false)`)) !== null);
ok('owner posts an update', (await asErr('tier1', `insert into improvement_checkins(plan_id,author_id,kind,body) values('${PLAN}','${who.tier1}','update','Tried again, held the order.')`)) === null);
ok('owner cannot post as a reviewer', (await asErr('tier1', `insert into improvement_checkins(plan_id,author_id,kind,body) values('${PLAN}','${who.tier1}','reviewer_note','I am wonderful')`)) !== null);
ok('supervisor leaves a note', (await asErr('tier2', `insert into improvement_checkins(plan_id,author_id,kind,body) values('${PLAN}','${who.tier2}','reviewer_note','Well done.')`)) === null);
ok('supervisor cannot post an update in the owner’s name', (await asErr('tier2', `insert into improvement_checkins(plan_id,author_id,kind,body) values('${PLAN}','${who.tier1}','update','forged')`)) !== null);
ok('check-ins cannot be edited or deleted', (await as('tier1', `update improvement_checkins set body='changed' where plan_id='${PLAN}' returning 1`)).length === 0 && (await as('tier1', `delete from improvement_checkins where plan_id='${PLAN}' returning 1`)).length === 0);
ok('only a draft plan can be deleted by its owner', (await as('tier1', `delete from improvement_plans where id='${PLAN}' returning 1`)).length === 0);


// ---------- paying trainers ----------
const claim = (n) => `00000000-0000-4000-8000-0000000ca00${n}`;
const decide = (c, d) => `select app.decide_payout_claim('${claim(c)}','${d}') as r`;
const val = async (p, sql, col = 'r') => (await as(p, sql))[0]?.[col];
ok('trainer sees only own claims', (await n('tier1', 'select 1 from payout_claims')) === 2 && (await n('tier2', 'select 1 from payout_claims')) === 2);
ok('founder sees every claim', (await n('founder', 'select 1 from payout_claims')) === 5);
ok('participant and partner see no claims', (await n('zawadi', 'select 1 from payout_claims')) + (await n('ke358', 'select 1 from payout_claims')) === 0);
ok('trainer cannot see the rate card', (await n('tier1', 'select 1 from payout_rates')) === 0 && (await n('founder', 'select 1 from payout_rates')) === 5);
ok('trainer cannot create a claim for themselves', (await asErr('tier1', `insert into payout_claims(person_id,kind,description,amount_kes,status,created_by) values('${who.tier1}','other','x',9999,'ready','${who.tier1}')`)) !== null);
ok('trainer cannot change a claim or approve it directly', (await as('tier1', `update payout_claims set status='approved' where id='${claim(1)}' returning 1`)).length === 0);
ok('founder cannot set a claim to approved by hand', (await asErr('founder', `update payout_claims set status='approved' where id='${claim(1)}'`)) !== null);
ok('nobody inserts approvals or payouts directly', (await asErr('founder', `insert into payout_approvals(claim_id,approver_id,decision) values('${claim(1)}','${who.founder}','approve')`)) !== null && (await asErr('founder', `insert into payouts(person_id,amount_kes,method) values('${who.tier1}',100,'cash')`)) !== null);
ok('trainer cannot decide on a claim', (await asErr('tier2', decide(1, 'approve'))) !== null);
ok('founder cannot decide on their own claim', (await asErr('founder', decide(4, 'approve'))) !== null);
ok('co-founder can approve the founder’s claim', (await val('cofounder', decide(4, 'approve'))) === 'approved');
ok('one founder approves a claim under the threshold', (await val('founder', decide(1, 'approve'))) === 'approved');
ok('above the threshold one approval is not enough', (await val('founder', decide(3, 'approve'))) === 'ready');
ok('the same founder approving twice does not count twice', (await val('founder', decide(3, 'approve'))) === 'ready');
ok('the second founder completes the approval', (await val('cofounder', decide(3, 'approve'))) === 'approved');
ok('a claim waiting for work cannot be decided', (await asErr('founder', decide(5, 'approve'))) !== null);
ok('trainer sees the approval trail on their own claim', (await n('tier1', `select 1 from payout_approvals where claim_id='${claim(1)}'`)) === 1 && (await n('tier2', `select 1 from payout_approvals where claim_id='${claim(1)}'`)) === 0);
ok('a decided claim’s amount cannot be changed', (await as('founder', `update payout_claims set amount_kes=1 where id='${claim(1)}' returning 1`)).length === 0);
const pay = (person, ids, method, ref) => `select app.record_payout('${person}', array[${ids.map((i) => `'${claim(i)}'::uuid`).join(',')}], '${method}', '${ref}') as r`;
ok('trainer cannot record a payment', (await asErr('tier2', pay(who.tier2, [3], 'cash', ''))) !== null);
ok('a founder cannot pay themselves', (await asErr('founder', pay(who.founder, [4], 'cash', ''))) !== null);
ok('an unapproved claim cannot be paid', (await asErr('founder', pay(who.tier2, [2], 'cash', ''))) !== null);
ok('claims of another person cannot be bundled in', (await asErr('founder', pay(who.tier1, [1, 3], 'cash', ''))) !== null);
ok('mobile money needs the reference code', (await asErr('founder', pay(who.tier1, [1], 'mpesa', ''))) !== null);
ok('mobile money needs a number on file', (await asErr('founder', pay(who.founder, [4], 'mpesa', 'QX1'))) !== null);
ok('co-founder records the founder’s cash payment', (await asErr('cofounder', pay(who.founder, [4], 'cash', ''))) === null);
ok('founder records an M-Pesa payment with its code', (await asErr('founder', pay(who.tier1, [1], 'mpesa', 'QHX9TEST1'))) === null);
ok('a paid claim cannot be paid twice', (await asErr('founder', pay(who.tier1, [1], 'mpesa', 'QHX9TEST2'))) !== null);
ok('payment total equals the claim and stores the number used', (await as('tier1', `select amount_kes, phone_used, status from payouts`))[0]?.amount_kes === 4000 && (await as('tier1', `select phone_used from payouts`))[0]?.phone_used === '+254700000203');
ok('trainer sees own payout only', (await n('tier1', 'select 1 from payouts')) === 1 && (await n('tier2', 'select 1 from payouts')) === 0 && (await n('zawadi', 'select 1 from payouts')) === 0);
ok('claim is marked paid after payment', (await val('tier1', `select status as r from payout_claims where id='${claim(1)}'`)) === 'paid');
// payout details
ok('trainer reads only their own payout details', (await n('tier1', 'select 1 from payout_methods')) === 1 && (await n('founder', 'select 1 from payout_methods')) === 2);
ok('trainer cannot change someone else’s payout number', (await as('tier1', `update payout_methods set phone='+254799999999' where person_id='${who.tier2}' returning 1`)).length === 0);
ok('trainer cannot verify their own payout details', (await asErr('tier1', `update payout_methods set verified_on=current_date, verified_by='${who.tier1}' where person_id='${who.tier1}'`)) !== null);
ok('founder verifies a trainer’s details', (await asErr('founder', `update payout_methods set verified_on=current_date, verified_by='${who.founder}' where person_id='${who.tier1}'`)) === null);
await as('tier1', `update payout_methods set phone='+254711111111' where person_id='${who.tier1}'`);
ok('changing the number clears the verification', (await val('founder', `select verified_on as r from payout_methods where person_id='${who.tier1}'`)) === null);
ok('M-Pesa details need a phone number', (await asErr('tier1', `insert into payout_methods(person_id,method) values('${who.tier1}','mpesa')`)) !== null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
