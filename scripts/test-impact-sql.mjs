// Loads every migration + the demo seed in an in-process Postgres (PGlite), adds sample baseline, learning, follow-up and exit
// rows, and checks that app.cohort_impact() counts them correctly and respects who may see what.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
await db.exec(`
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(coalesce(current_setting('request.jwt.claim.sub', true), ''),'')::uuid $$;
  create role authenticated; create role anon;
`);
for (const f of ['0001_schema', '0002_rls', '0003_partner_aggregates', '0004_function_search_path', '0006_team_suggestions_journey', '0007_levels_crm_reports_alerts', '0008_followup_forms', '0009_impact_data'])
  await db.exec(readFileSync(`supabase/migrations/${f}.sql`, 'utf8'));
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
let bad = 0;
const check = (n, c, x = '') => { if (!c) bad++; console.log(`${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : '  -> ' + JSON.stringify(x).slice(0, 300)}`); };
const one = async (sql) => (await db.query(sql)).rows;

// helpers
check('to_int reads numbers out of words', (await one("select app.to_int('KES 12,500') a, app.to_int('abc') b, app.to_int('3.6') c"))[0].a === 12500 && (await one("select app.to_int('abc') b"))[0].b === null && (await one("select app.to_int('3.6') c"))[0].c === 4);
check('code turns labels into one spelling', (await one("select app.code('About the same') a, app.code('  Not yet! ') b"))[0].a === 'about_the_same' && (await one("select app.code('  Not yet! ') b"))[0].b === 'not_yet');
check('tally counts values', JSON.stringify((await one("select app.tally(array['a','b','a',null,'']) t"))[0].t) === '{"a":2,"b":1}');

const C1 = '00000000-0000-4000-8000-000000000501';
const en = await one(`select e.id, p.id person from enrolments e join people p on p.id = e.person_id where e.cohort_id = '${C1}' order by p.full_name`);
check('seed has participants in cohort 1', en.length >= 2, en);
const [e1, e2] = en;
await db.exec(`update people set gender='female', birth_year=1985 where id='${e1.person}'; update people set gender='male', birth_year=2010 where id='${e2.person}';`);
await db.exec(`update enrolments set story_consent='named', partner_ref='CDC-1' where id='${e1.id}'`);
await db.exec(`
  insert into baselines(enrolment_id, kind, business_stage, weekly_sales_range, keeps_records, separates_money, meal_skipped, household_size, dependants, children_in_school, customers_good_day, stock_value_kes, in_savings_group)
    values ('${e1.id}','adult','running','1,000 to 2,999','no','not_yet','sometimes',6,4,3,10,5000,false);
  insert into baselines(enrolment_id, kind, education_status, hoped_path, has_cv, confidence) values ('${e2.id}','youth','out_of_school','own_business',false,2);
  insert into learning_checks(enrolment_id, stage, score, out_of, confidence) values ('${e1.id}','pre',2,6,2),('${e1.id}','post',5,6,4),('${e2.id}','pre',3,6,3);
  insert into exit_feedback(enrolment_id, rating, confidence, recommend) values ('${e1.id}',5,4,true);
  insert into followup_forms(stage, cohort_id, enrolment_id, participant_name, business_status, operating, sold_14_days, income_vs, keeps_records, separates_money, meal_skipped, sales_range, urgent, support_used, household_changes)
    values (30,'${C1}','${e1.id}','Test One','growing',true,true,'higher','daily','always','no','3,000 to 5,999',false,'yes',array['More regular meals','Able to save']);
  insert into youth_followups(stage, cohort_id, enrolment_id, participant_name, status, first_income, cv_ready, interviews, officer_view, safety_concern)
    values (30,'${C1}','${e2.id}','Test Two','self_employed',true,true,2,'on_track',false);
`);
const m = async (who) => {
  await db.exec(`set local role authenticated`).catch(() => {});
  return null;
};
const asRole = async (personId, sql) => {
  await db.exec("begin");
  try {
    await db.query(`select set_config('request.jwt.claim.sub', (select auth_user_id::text from people where id='${personId}'), true)`);
    await db.exec('set local role authenticated');
    return (await db.query(sql)).rows;
  } finally { await db.exec('rollback'); }
};
const P = (n) => `00000000-0000-4000-8000-000000000${n}`;
const founder = await asRole(P(101), 'select cohort_id, metrics from app.cohort_impact()');
const r = founder.find((x) => x.cohort_id === C1)?.metrics;
check('founder sees cohort 1 impact', !!r);
check('counts who is enrolled and gender', r?.enrolled >= 2 && r.gender.female === 1 && r.gender.male === 1, r?.gender);
check('age bands use the cohort start year', r?.age['35_plus'] >= 1 && r?.age.under_18 === 1, r?.age);
check('story consent and partner reference are counted', r?.story_named === 1 && r?.with_partner_ref === 1);
check('baseline adult and youth counts', r?.baseline.adult_n === 1 && r?.baseline.youth_n === 1 && r?.baseline.operating === 1, r?.baseline);
check('baseline sales distribution', r?.baseline.sales['1,000 to 2,999'] === 1, r?.baseline.sales);
check('household numbers', r?.baseline.avg_household === 6 && r?.baseline.children_in_school === 3, r?.baseline);
check('learning paired gain is 50 points (2/6 to 5/6)', r?.learning.paired_n === 1 && r?.learning.paired_gain === 50 && r?.learning.pre_n === 2 && r?.learning.post_n === 1, r?.learning);
check('exit feedback counted', r?.exit.n === 1 && r?.exit.recommend === 1 && r?.exit.rating === 5, r?.exit);
check('adult day 30 results', r?.adult['30'].n === 1 && r?.adult['30'].sold14 === 1 && r?.adult['30'].higher === 1 && r?.adult['30'].growing === 1 && r?.adult['30'].household['More regular meals'] === 1, r?.adult?.['30']);
check('adult day 60 is empty, not missing', r?.adult['60'].n === 0, r?.adult?.['60']);
check('youth day 30 results', r?.youth['30'].n === 1 && r?.youth['30'].first_income === 1 && r?.youth['30'].interviews === 2 && r?.youth['30'].status.self_employed === 1, r?.youth?.['30']);

// who may see what
const participant = await asRole(P(301), 'select cohort_id from app.cohort_impact()');
check('a participant sees no cohort totals', participant.length === 0, participant);
const base = await asRole(P(301), `select count(*)::int n from baselines`);
check('a participant sees only their own baseline row', base[0].n <= 1, base);
const agg = await asRole(P(401), 'select cohort_id from app.cohort_impact()');
check('the partner sees its cohort totals', agg.some((x) => x.cohort_id === C1), agg);
const other = await asRole(P(402), 'select cohort_id from app.cohort_impact()');
check('another partner does not see cohort 1', !other.some((x) => x.cohort_id === C1), other);
const names = await asRole(P(401), 'select count(*)::int n from baselines');
console.log('partner baselines visible (depends on named access):', names[0].n);
console.log(bad ? `\n${bad} FAILED` : '\nall passed'); process.exit(bad ? 1 : 0);
