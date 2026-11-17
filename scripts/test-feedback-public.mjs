// System feedback (answers stay private, founders see totals of 3 or more) and the public impact numbers (whitelisted, small groups hidden).
// Run: node scripts/test-feedback-public.mjs
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
  drop table _m;`);
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  -> ' + x}`); };

// Who may call the public function is checked before the test's blanket grants below.
const priv = async (fn) => (await db.query(`select has_function_privilege('authenticated','${fn}','execute') a, has_function_privilege('anon','${fn}','execute') b`)).rows[0];
const pi = await priv('app.public_impact()'), cm = await priv('app.cohort_metrics(public.cohorts)');
ok('signed-in people cannot call the public impact function directly', !pi.a && !pi.b);
ok('signed-in people cannot call the cohort metrics function directly', !cm.a && !cm.b);

await db.exec(`grant usage on schema public, app, auth to authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant usage, select on all sequences in schema public to authenticated;
  grant execute on function app.me(), app.is_founder(), app.has_role(text), app.feedback_summary() to authenticated;`);
const P = (n) => `00000000-0000-4000-8000-000000000${n}`;
async function as(id, sql, params) {
  const aid = (await db.query('select auth_user_id from public.people where id = $1', [id])).rows[0].auth_user_id;
  await db.exec(`reset role; set request.jwt.sub = '${aid}'; set role authenticated;`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role;'); }
}
const err = async (id, sql) => { try { await as(id, sql); return null; } catch (e) { return e.message; } };
const founder = P(101);

// ----- feedback -----
const people = (await db.query(`select distinct person_id from public.role_assignments where role in ('facilitator','org_admin','org_viewer') and status='active' limit 6`)).rows.map((r) => r.person_id);
ok('there are enough seeded people to test with', people.length >= 4, String(people.length));
const ans = (p, ease, rec, extra = '') => `insert into public.system_feedback(person_id, audience, ease, recommend, valuable, frustration, missing, tenure_days, visits) values ('${p}','trainer',${ease},${rec},'{attendance,earnings}','slow','export',40,12)${extra}`;
ok('a person can add their own answer', (await err(people[0], ans(people[0], 4, 9))) === null);
ok('a person cannot answer for someone else', (await err(people[0], ans(people[1], 4, 9))) !== null);
ok('an answer cannot name more than three useful things', (await err(people[1], ans(people[1], 4, 9).replace('{attendance,earnings}', '{a,b,c,d}'))) !== null);
ok('ease must be 1 to 5', (await err(people[1], ans(people[1], 6, 9))) !== null);
ok('a person sees only their own answers', (await as(people[0], 'select 1 from public.system_feedback')).length === 1);
ok('another person sees none of it', (await as(people[1], 'select 1 from public.system_feedback')).length === 0);
ok('founders cannot read individual answers', (await as(founder, 'select 1 from public.system_feedback')).length === 0);
ok('non-founders cannot read the summary', (await err(people[0], 'select app.feedback_summary()')) !== null);
let s = (await as(founder, 'select app.feedback_summary() s'))[0].s;
ok('one answer is not enough to show a group', s.overall === null && s.responses === 1);
await as(people[1], ans(people[1], 5, 10)); await as(people[2], ans(people[2], 3, 6));
s = (await as(founder, 'select app.feedback_summary() s'))[0].s;
ok('three answers show the totals', s.overall && s.overall.n === 3, JSON.stringify(s.overall));
ok('average ease is right', Math.abs(Number(s.overall.ease_avg) - 4) < 0.01, String(s.overall.ease_avg));
ok('net promoter score is right (1 promoter pair, 1 detractor)', s.overall.nps === 33, String(s.overall.nps));
ok('most valuable things are counted', s.overall.valuable.attendance === 3 && s.overall.valuable.earnings === 3);
ok('summary carries no names or ids', !/person|full_name|phone|email/i.test(JSON.stringify(s)));

// ----- public impact -----
const rows = (await db.query('select * from app.public_impact()')).rows;
ok('public impact returns cohorts', rows.length > 0, String(rows.length));
const keys = new Set(); const walk = (o) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { keys.add(k); walk(v); } };
rows.forEach((r) => walk(r.m));
const banned = ['phone', 'name', 'email', 'person', 'disability', 'support', 'exit_reasons', 'urgent', 'safety', 'meal_any', 'meal_often', 'story_named', 'concerns', 'challenges'];
ok('public numbers carry none of the sensitive keys', !banned.some((b) => [...keys].some((k) => k.includes(b))), [...keys].filter((k) => banned.some((b) => k.includes(b))).join(','));
ok('requested, quoted and confirmed cohorts are not published', rows.every((r) => ['delivering', 'followup', 'closed'].includes(r.status)));
ok('small cohorts carry only a head count', rows.filter((r) => r.small).every((r) => Object.keys(r.m).join() === 'enrolled'));
ok('anonymous listing does not name the organisation', rows.every((r) => r.org_name === null));
const org = (await db.query(`select o.id from organisations o join cohorts c on c.organisation_id=o.id where c.status in ('delivering','followup','closed') and not o.is_internal limit 1`)).rows[0];
if (org) {
  await db.query(`insert into agreements(organisation_id, public_listing) values ($1,'named') on conflict (organisation_id) do update set public_listing='named'`, [org.id]);
  ok('named listing shows the organisation', (await db.query('select org_name from app.public_impact() where org_name is not null')).rows.length > 0);
  await db.query(`update agreements set public_listing='hidden' where organisation_id=$1`, [org.id]);
  const before = rows.length, after = (await db.query('select 1 from app.public_impact()')).rows.length;
  ok('hidden listing removes that organisation', after < before, `${before} -> ${after}`);
}
ok('the founders’ own cohort is never published', (await db.query(`select 1 from app.public_impact() p join cohorts c on c.seq=p.seq join organisations o on o.id=c.organisation_id where o.is_internal`)).rows.length === 0);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
