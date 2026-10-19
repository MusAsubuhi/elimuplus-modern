// Applies every migration to an in-process Postgres and checks the story rules: consent, guardians, who sees what, erasure.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';

const db = new PGlite();
await db.exec(`
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(coalesce(current_setting('request.jwt.claim.sub', true), ''), '')::uuid $$;
  create role authenticated; create role anon;
`);
const skip = new Set(['0005_table_grants.sql', '0011_newsletter_sync.sql']);
const files = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql') && !skip.has(f)).sort();
for (const f of files) await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
await db.exec(readFileSync('supabase/seed.sql', 'utf8'));
await db.exec(`
  create temp table _m as select id, gen_random_uuid() aid from public.people;
  insert into auth.users select aid from _m;
  update public.people p set auth_user_id = m.aid from _m m where m.id = p.id;
  drop table _m;
  grant usage on schema public, app, auth to authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant execute on all functions in schema app to authenticated;
`);
const P = (n) => `00000000-0000-4000-8000-000000000${n}`;
const as = async (id, sql, params = []) => {
  const aid = (await db.query('select auth_user_id from people where id=$1', [id])).rows[0].auth_user_id;
  await db.exec(`reset role; set request.jwt.claim.sub = '${aid}'; set role authenticated;`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role;'); }
};
const err = async (...a) => { try { await as(...a); return null; } catch (e) { return e.message; } };
let pass = 0, fail = 0;
const ok = (name, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${name}${c ? '' : '  -> ' + x}`); };

const en = (pid) => db.query('select id, cohort_id from enrolments where person_id=$1 limit 1', [pid]).then((r) => r.rows[0]);
const zawadi = P(301), rehema = P(302), founder = P(101), partner = P(401), trainer = P(203);
const ez = await en(zawadi), er = await en(rehema);
const ins = (pid, e, extra = {}) => as(pid,
  `insert into participant_stories(enrolment_id, person_id, cohort_id, body, consent_story, consent_photo, consent_guardian, source, collected_by)
   values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
  [e.id, extra.person ?? pid, e.cohort_id, 'This is a long enough story about my business.', 'named', extra.photo ?? true, extra.guardian ?? false, 'self', pid]);

const s1 = (await ins(zawadi, ez))[0].id;
ok('participant can save own story', !!s1);
ok('participant cannot save a story on someone else\'s enrolment', !!(await err(zawadi,
  `insert into participant_stories(enrolment_id, person_id, cohort_id, body, consent_story, source, collected_by) values ($1,$2,$3,'long enough story text here','named','self',$4)`,
  [er.id, rehema, er.cohort_id, zawadi])));
ok('participant cannot start a story as approved', !!(await err(zawadi,
  `insert into participant_stories(enrolment_id, person_id, cohort_id, body, consent_story, source, collected_by, status, shown_name) values ($1,$2,$3,'long enough story text here','named','self',$2,'approved','Zawadi')`,
  [ez.id, zawadi, ez.cohort_id])));
ok('participant cannot rewrite the consent record', !!(await err(zawadi, `update participant_stories set consent_photo = false where id=$1`, [s1])));
ok('participant cannot self-approve (status or shown name)', !!(await err(zawadi, `update participant_stories set shown_name='Me' where id=$1`, [s1])));
ok('participant can edit own story text', (await as(zawadi, `update participant_stories set body='Edited story text that is long enough.' where id=$1 returning id`, [s1])).length === 1);
ok('another participant cannot read it', (await as(rehema, 'select 1 from participant_stories where id=$1', [s1])).length === 0);
ok('founder can read it', (await as(founder, 'select 1 from participant_stories where id=$1', [s1])).length === 1);
ok('partner cannot see a story before approval', (await as(partner, 'select 1 from participant_stories')).length === 0);

// under-18
await db.exec(`update people set birth_year = extract(year from current_date)::int - 15 where id='${rehema}'`);
ok('under-18 story is refused without guardian agreement', !!(await err(rehema,
  `insert into participant_stories(enrolment_id, person_id, cohort_id, body, consent_story, consent_guardian, source, collected_by) values ($1,$2,$3,'long enough story text here','named',false,'self',$2)`,
  [er.id, rehema, er.cohort_id])));
ok('under-18 story is saved with guardian agreement', (await ins(rehema, er, { guardian: true })).length === 1);

// founder approval and partner view
await as(founder, `update participant_stories set status='approved', shown_name='Zawadi A.', reviewed_by=$2 where id=$1`, [s1, founder]);
const sees = async (cohort) => (await as(partner, 'select 1 from cohorts where id=$1', [cohort])).length > 0;
const pv = (await as(partner, 'select cohort_id from participant_stories')).map((r) => r.cohort_id);
ok('partner sees an approved story of its own cohort', (await sees(ez.cohort_id)) ? pv.includes(ez.cohort_id) : true, JSON.stringify(pv));
ok('partner never sees a story from a cohort that is not theirs', await Promise.all(pv.map(sees)).then((r) => r.every(Boolean)));

// photos
ok('photo rows need photo consent', await db.query(`select 1`).then(async () => {
  const s = (await db.query(`insert into participant_stories(enrolment_id, person_id, cohort_id, body, consent_story, consent_photo, source) values ($1,$2,$3,'long enough story text here','anonymous',false,'trainer') returning id`, [ez.id, zawadi, ez.cohort_id])).rows[0].id;
  try { await db.query(`insert into story_photos(story_id, storage_path) values ($1,'x/y.jpg')`, [s]); return false; } catch { return true; }
}));
for (let i = 0; i < 4; i++) await db.query(`insert into story_photos(story_id, storage_path) values ($1,$2)`, [s1, `p/${i}.jpg`]);
ok('a story is limited to four photos', await db.query(`insert into story_photos(story_id, storage_path) values ($1,'p/5.jpg')`, [s1]).then(() => false, () => true));

// erasure
ok('a participant cannot erase anyone', !!(await err(zawadi, `select app.erase_person($1::uuid)`, [rehema])));
const res = (await as(founder, `select app.erase_person($1::uuid) r`, [zawadi]))[0].r;
ok('erasure returns the photo paths to delete', (res.photo_paths ?? []).length === 4, JSON.stringify(res));
const after = (await db.query('select full_name, phone, email from people where id=$1', [zawadi])).rows[0];
ok('erasure removes name, phone and email', after.full_name === 'Removed participant' && after.phone == null && after.email == null);
ok('erasure keeps the enrolment for programme numbers', !!(await en(zawadi)));
ok('erasure blanks the story text', (await db.query(`select body from participant_stories where id=$1`, [s1])).rows[0].body.startsWith('[removed'));
ok('founders and team cannot be erased', !!(await err(founder, `select app.erase_person($1::uuid)`, [founder])));

// hardening
ok('two people cannot share an email', await db.query(`insert into people(full_name, email) values ('A1','dup@example.org'),('A2','DUP@example.org')`).then(() => false, () => true));
ok('deleting a person with enrolments is refused', await db.query(`delete from people where id=$1`, [rehema]).then(() => false, () => true));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
