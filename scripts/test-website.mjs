// Website listings: new cohorts become drafts, only published listings reach the public feed, only wording is exposed.
// Run: node scripts/test-website.mjs
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
const trainer = '00000000-0000-4000-8000-000000000202';
const org = '00000000-0000-4000-8000-0000000000a2';
const feed = async () => (await db.query('select app.public_cohort_listings() r')).rows[0].r;

const base = await feed();
ok('the planned cards are carried over; the two hand-written cards are retired', base.length === 2 && base[0].heading === 'January 2027' && base[1].heading === 'April 2027', JSON.stringify(base.map((x) => x.heading)));

await db.exec(`insert into public.cohorts(organisation_id,name,format,language,audience,start_date,venue,status)
  values ('${org}','Test Youth Cohort','12-day','sw','Youth, Form 3','2027-06-10','Likoni','requested')`);
const [draft] = (await db.query(`select l.*, c.id cid from public.website_listings l join public.cohorts c on c.id=l.cohort_id where c.name='Test Youth Cohort'`)).rows;
ok('a new cohort creates a draft listing', draft?.status === 'draft', JSON.stringify(draft));
ok('draft wording is written from the cohort', draft.badge === 'Youth · 12-Day SEE' && draft.heading === 'June 2027' && /Likoni/.test(draft.blurb) && draft.date_note === 'Starts 10 June 2027', JSON.stringify(draft));
ok('a draft is not in the public feed', (await feed()).length === 2);
ok('a founder alert asks for a decision', (await db.query(`select count(*)::int n from public.founder_alerts where kind='website' and source_id=$1`, [draft.cid])).rows[0].n === 1);

await db.exec(`insert into public.cohorts(organisation_id,name,format,language,audience,status) values ('${org}','Founders'' cohort test','5-day','en','Founders','requested'),('${org}','Old finished','5-day','sw','Adults','closed')`);
ok('the founders cohort and finished cohorts get no draft', (await db.query(`select count(*)::int n from public.website_listings l join public.cohorts c on c.id=l.cohort_id where c.name in ('Founders'' cohort test','Old finished')`)).rows[0].n === 0);

ok('a trainer cannot read listings', (await as(trainer, 'select * from public.website_listings')).length === 0);
ok('a trainer cannot publish', (await as(trainer, `update public.website_listings set status='published' where id=$1 returning id`, [draft.id])).length === 0);
ok('a founder sees the draft', (await as(founder, 'select id from public.website_listings where id=$1', [draft.id])).length === 1);

await as(founder, `update public.website_listings set status='published', published_at=now() where id=$1`, [draft.id]);
let f = await feed();
const pub = f.find((x) => x.heading === 'June 2027');
ok('publishing puts it in the feed', !!pub && f.length === 3);
ok('the feed carries only four wording fields', pub && Object.keys(pub).sort().join() === 'badge,blurb,date_note,heading', pub && Object.keys(pub).join());
ok('feed is ordered by date, and ', f.map((x) => x.heading).join() === 'January 2027,April 2027,June 2027', f.map((x) => x.heading).join());

await db.exec(`update public.cohorts set start_date=current_date-10, end_date=current_date-3, status='followup' where name='Test Youth Cohort'`);
const fin = (await feed()).find((x) => x.heading === 'June 2027');
ok('a finished cohort in follow-up stays, labelled finished', !!fin && /^Finished .* · follow-up visits under way$/.test(fin.date_note), fin && fin.date_note);
await db.exec(`update public.cohorts set start_date=current_date-1, end_date=current_date+5, status='quoted' where name='Test Youth Cohort'`);
ok('a running cohort says under way, with its end date', /^Under way · ends /.test(((await feed()).find((x) => x.heading === 'June 2027') ?? {}).date_note ?? ''));
await db.exec(`update public.cohorts set start_date=current_date-60, end_date=current_date-40, status='followup' where name='Test Youth Cohort'`);
ok('a cohort leaves the website 30 days after it ends', !(await feed()).some((x) => x.heading === 'June 2027'));
await db.exec(`update public.cohorts set start_date=current_date-10, end_date=current_date-3 where name='Test Youth Cohort'`);
await db.exec(`update public.cohorts set status='closed' where name='Test Youth Cohort'`);
ok('a closed cohort leaves the website', !(await feed()).some((x) => x.heading === 'June 2027'));
await db.exec(`update public.cohorts set status='quoted' where name='Test Youth Cohort'; update public.website_listings set status='hidden' where id='${draft.id}'`);
ok('hiding takes it off the website', !(await feed()).some((x) => x.heading === 'June 2027'));

await db.exec(`insert into public.website_listings(badge,heading,blurb,date_note,starts_on,status) values ('Youth · 12-Day SEE','Last month','x','x', date_trunc('month', current_date)::date - interval '40 days','published')`);
ok('a planned listing drops off after its month has passed', !(await feed()).some((x) => x.heading === 'Last month'));
ok('the feed function is not callable by signed-in people', /permission denied/i.test((await err(founder, 'select app.public_cohort_listings()')) ?? ''));

// A new cohort takes over the matching planned card instead of duplicating it
const before = (await feed()).length;
await db.exec(`insert into public.cohorts(organisation_id,name,format,language,audience,start_date,venue,status)
  values ('${org}','Adoption Test Cohort','5-day','sw','Adults','2027-01-12','Likoni','requested')`);
const [adopted] = (await db.query(`select l.* from public.website_listings l join public.cohorts c on c.id=l.cohort_id where c.name='Adoption Test Cohort'`)).rows;
ok('a new cohort takes over the planned January card', adopted?.heading === 'January 2027' && adopted.status === 'published', JSON.stringify(adopted));
ok('no duplicate card is created', (await db.query(`select count(*)::int n from public.website_listings where heading='January 2027' or starts_on='2027-01-12'`)).rows[0].n === 1);
ok('the taken-over card shows live dates', ((await feed()).find((x) => x.heading === 'January 2027') ?? {}).date_note === 'Starts 12 January 2027');
ok('the founders are told to check the wording', (await db.query(`select count(*)::int n from public.founder_alerts where kind='website' and title like 'A cohort took over%'`)).rows[0].n === 1);
ok('the feed length is unchanged by adoption', (await feed()).length === before);

// Next forum date
const nf = async () => (await db.query('select app.public_next_forum() f')).rows[0].f;
ok('no forum recorded gives no date', (await nf()) === null);
await db.exec(`insert into public.seminars(code,title,held_on,venue,status) values ('F-TEST','Monthly Elimu+ Forum', current_date + 20, 'Likoni', 'planned')`);
ok('the next recorded forum is reported by date only', /^\d{1,2} [A-Z][a-z]+ \d{4}$/.test((await nf()) ?? ''), await nf());
ok('the forum function is not callable by signed-in people', /permission denied/i.test((await err(founder, 'select app.public_next_forum()')) ?? ''));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
