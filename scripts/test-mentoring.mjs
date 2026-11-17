// Mentoring: vetting gate, circle safeguarding, privacy of notes and feedback, totals hidden under three answers.
// Run: node scripts/test-mentoring.mjs
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
await db.exec(`create temp table _m as select id, gen_random_uuid() as aid from public.people;
  insert into auth.users select aid from _m; update public.people p set auth_user_id = m.aid from _m m where m.id = p.id; drop table _m;`);
await db.exec(`grant usage on schema public, app, auth to authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant execute on function app.me(), app.is_founder(), app.my_orgs(), app.my_mentor_id(), app.my_circles(), app.i_mentor_circle(uuid), app.is_minor(uuid), app.circle_feedback(uuid), app.circle_roster(uuid), app.mentoring_summary(), app.circles_visible() to authenticated;`);
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  -> ' + x}`); };
async function as(id, sql, params) {
  const aid = (await db.query('select auth_user_id from public.people where id = $1', [id])).rows[0].auth_user_id;
  await db.exec(`reset role; set request.jwt.sub = '${aid}'; set role authenticated;`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role;'); }
}
const err = async (id, sql, p) => { try { await as(id, sql, p); return null; } catch (e) { return e.message; } };
const founder = '00000000-0000-4000-8000-000000000101';

// Fixtures: a cohort with six adults, one 16-year-old with guardian consent, one 16-year-old without.
const cohort = (await db.query(`select id from public.cohorts limit 1`)).rows[0].id;
const mk = async (name, birth) => (await db.query(`insert into public.people(full_name, birth_year) values ($1,$2) returning id`, [name, birth])).rows[0].id;
const adults = []; for (let i = 0; i < 7; i++) adults.push(await mk('Adult ' + i, 1990));
const minorOk = await mk('Minor Ok', new Date().getFullYear() - 16), minorNo = await mk('Minor No', new Date().getFullYear() - 16);
for (const p of [...adults, minorOk, minorNo]) await db.query(`insert into public.enrolments(cohort_id, person_id, track, status, guardian_consent) values ($1,$2,'standard','enrolled',$3)`, [cohort, p, p === minorOk]);
const mentorPerson = await mk('Mentor Mary', 1980);
await db.exec(`insert into public.role_assignments(person_id, role, status) values ('${mentorPerson}','mentor','active')`);
const mentor = (await db.query(`insert into public.mentors(full_name, person_id, status, interview_on, referee_on, briefing_on, agreement_on) values ('Mentor Mary',$1,'active',current_date,current_date,current_date,current_date) returning id`, [mentorPerson])).rows[0].id;

const outsider = await mk('Not enrolled', 1991);
await db.exec(`create temp table _n as select id, gen_random_uuid() as aid from public.people where auth_user_id is null;
  insert into auth.users select aid from _n; update public.people p set auth_user_id = n.aid from _n n where n.id = p.id; drop table _n;`);
ok('a mentor cannot be activated before vetting steps are recorded', !!(await db.query(`select 1`)) && (await err(founder, `insert into public.mentors(full_name, person_id, status) values ('X','${adults[0]}','active')`)) !== null);
const circle = (await as(founder, `insert into public.mentoring_circles(cohort_id, mentor_id, name, status) values ($1,$2,'Circle A','active') returning id`, [cohort, mentor]))[0].id;
ok('only founders create circles', (await err(mentorPerson, `insert into public.mentoring_circles(cohort_id, mentor_id, name) values ('${cohort}','${mentor}','Circle B')`)) !== null);
for (let i = 0; i < 5; i++) await as(founder, `insert into public.circle_members(circle_id, person_id) values ($1,$2)`, [circle, adults[i]]);
ok('a circle holds at most five', (await err(founder, `insert into public.circle_members(circle_id, person_id) values ('${circle}','${adults[5]}')`)) !== null);
await db.query(`delete from public.circle_members where person_id = $1`, [adults[4]]);
ok('someone under 18 without guardian agreement cannot join', (await err(founder, `insert into public.circle_members(circle_id, person_id) values ('${circle}','${minorNo}')`)) !== null);
ok('someone under 18 needs the partner representative named first', (await err(founder, `insert into public.circle_members(circle_id, person_id) values ('${circle}','${minorOk}')`)) !== null);
await db.query(`update public.mentoring_circles set partner_rep_name='Pastor Joy' where id=$1`, [circle]);
ok('with agreement and a representative a minor can join', (await err(founder, `insert into public.circle_members(circle_id, person_id) values ('${circle}','${minorOk}')`)) === null);
ok('the circle is flagged as including minors', (await db.query(`select has_minors from public.mentoring_circles where id=$1`, [circle])).rows[0].has_minors === true);
ok('a mentor cannot join their own circle', (await err(founder, `insert into public.circle_members(circle_id, person_id) values ('${circle}','${mentorPerson}')`)) !== null);
ok('only people enrolled in the cohort can join', (await err(founder, `insert into public.circle_members(circle_id, person_id) values ('${circle}','${outsider}')`)) !== null);

// Meetings
const mt = (await as(mentorPerson, `insert into public.circle_meetings(circle_id, held_on, status, topic) values ($1, current_date - 1, 'held', 'Pricing') returning id`, [circle]))[0].id;
ok('a future session cannot be recorded as held', (await err(mentorPerson, `insert into public.circle_meetings(circle_id, held_on, status) values ('${circle}', current_date + 5, 'held')`)) !== null);
await as(mentorPerson, `insert into public.circle_meeting_notes(meeting_id, notes, concern) values ($1,'private note',true)`, [mt]);
ok('a member cannot read meeting notes', (await as(adults[0], `select 1 from public.circle_meeting_notes`)).length === 0);
ok('the mentor reads their notes', (await as(mentorPerson, `select 1 from public.circle_meeting_notes`)).length === 1);
await as(mentorPerson, `insert into public.circle_commitments(meeting_id, circle_id, person_id, text) values ($1,$2,$3,'Price three products')`, [mt, circle, adults[0]]);
ok('a member sees only their own commitment', (await as(adults[1], `select 1 from public.circle_commitments`)).length === 0 && (await as(adults[0], `select 1 from public.circle_commitments`)).length === 1);
ok('a member can tick their own commitment', (await err(adults[0], `update public.circle_commitments set done = true`)) === null);
ok('a member cannot rewrite a commitment', (await err(adults[0], `update public.circle_commitments set text = 'Something else entirely'`)) !== null);

// Feedback
const fb = (p) => `insert into public.mentoring_feedback(meeting_id, circle_id, person_id, role, usefulness, next_step_clear, pace, improve) values ('${mt}','${circle}','${p}','mentee',4,5,'right','{more_practice}')`;
ok('a member answers for themselves', (await err(adults[0], fb(adults[0]))) === null);
ok('a member cannot answer for someone else', (await err(adults[1], fb(adults[0]).replace(`'${adults[0]}','mentee'`, `'${adults[0]}','mentee'`))) !== null);
ok('an outsider cannot answer', (await err(outsider, fb(outsider))) !== null);
ok('a member sees only their own answer', (await as(adults[0], `select 1 from public.mentoring_feedback`)).length === 1 && (await as(adults[1], `select 1 from public.mentoring_feedback`)).length === 0);
ok('founders cannot read mentee answers', (await as(founder, `select 1 from public.mentoring_feedback where role='mentee'`)).length === 0);
ok('mentee rows cannot carry free text', (await err(adults[2], fb(adults[2]).replace(`'{more_practice}')`, `'{more_practice}')`).replace('improve)', 'improve, went_well)').replace(`'{more_practice}')`, `'{more_practice}','text')`))) !== null);
ok('totals hidden under three answers', (await as(mentorPerson, `select app.circle_feedback($1) r`, [circle]))[0].r.hidden === true);
await as(adults[1], fb(adults[1]).replace('(meeting_id', '(meeting_id')); await as(adults[2], fb(adults[2]));
const t = (await as(mentorPerson, `select app.circle_feedback($1) r`, [circle]))[0].r;
ok('totals show at three answers', t.hidden === false && Number(t.usefulness) === 4, JSON.stringify(t));
ok('the founder summary is available to founders only', (await as(founder, `select app.mentoring_summary() r`))[0].r.meetings === 1 && (await err(adults[0], `select app.mentoring_summary()`)) !== null);
ok('a member sees first names only in the roster', (await as(adults[0], `select name from app.circle_roster($1) where role='mentee'`, [circle])).every((r) => !r.name.includes(' ')));
const cv = await as(adults[0], `select mentor_name, members from app.circles_visible()`);
ok('a member sees their circle with the mentor name, not the mentors table', cv.length === 1 && cv[0].mentor_name === 'Mentor Mary' && (await as(adults[0], `select 1 from public.mentors`)).length === 0);
ok('someone outside any circle sees no circles', (await as(outsider, `select 1 from app.circles_visible()`)).length === 0);
ok('the mentor sees their circle', (await as(mentorPerson, `select 1 from app.circles_visible()`)).length === 1);
ok('public mentoring figures are not callable by signed-in people', (await db.query(`select has_function_privilege('authenticated','app.public_mentoring()','execute') a`)).rows[0].a === false);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
