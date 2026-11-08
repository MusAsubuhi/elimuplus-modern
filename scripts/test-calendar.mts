// Training calendar: overlap rules, phone-calendar text, and who may see what in the database.
// Run: npx tsx scripts/test-calendar.mts
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { addDays, findClashes, icsCalendar, monthWeeks, trainingEvents, worstLevel, type Training } from '../src/lib/calendar-core.ts';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x: any = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  -> ' + JSON.stringify(x)}`); };

// ---- pure rules
const T = (id: string, days: string[], trainers: string[], over: Partial<Training> = {}): Training => ({
  id, name: `Cohort ${id}`, org: `Org ${id}`, status: 'confirmed', format: '5-day', language: 'en', audience: null, venue: null, expected: 20, enrolled: 0,
  start: days[0] ?? null, end: days[days.length - 1] ?? null, days, trainers: trainers.map((n) => ({ id: n, name: n.toUpperCase(), role: 'lead' })), startTime: null, endTime: null, timeNote: null, canSetTime: false, ...over,
});
const wk = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
const next = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];

let c = findClashes([T('a', wk, ['ann']), T('b', next, ['ann'])]);
ok('trainings on different weeks do not clash even with the same trainer', c.size === 0);

c = findClashes([T('a', wk, ['ann']), T('b', wk.slice(3), ['ann'])]);
ok('the same trainer on overlapping days is a conflict', worstLevel(c.get('a')) === 'conflict' && c.get('a')![0].days.length === 2, c.get('a'));
ok('a conflict can not be confirmed', c.get('a')![0].canConfirm === false);

c = findClashes([T('a', wk, ['ann']), T('b', wk, ['bob'])]);
ok('different trainers on the same days need checking', worstLevel(c.get('b')) === 'check' && c.get('b')![0].canConfirm === true);

c = findClashes([T('a', wk, ['ann']), T('b', wk, [])]);
ok('a training with no trainer yet is flagged and can not be confirmed', worstLevel(c.get('a')) === 'check' && c.get('a')![0].canConfirm === false && c.get('a')![0].unstaffed.length === 1, c.get('a'));

c = findClashes([T('a', wk, ['ann']), T('b', wk, ['bob'])], [{ a: 'a', b: 'b', by: 'Asubuhi', at: '2026-11-07', note: 'phoned both' }]);
ok('a confirmation turns the overlap green', worstLevel(c.get('a')) === 'confirmed' && c.get('a')![0].confirmedBy === 'Asubuhi');

c = findClashes([T('a', wk, ['ann']), T('b', wk, ['ann'])], [{ a: 'a', b: 'b', by: 'x', at: '2026-11-07', note: null }]);
ok('a confirmation never hides a trainer on both trainings', worstLevel(c.get('a')) === 'conflict');

c = findClashes([T('a', wk, ['ann']), T('b', wk, ['bob'], { status: 'closed' })]);
ok('closed trainings are history, not overlaps', c.size === 0);

c = findClashes([T('a', wk, ['ann'], { venue: 'Likoni Hall' }), T('b', wk, ['bob'], { venue: ' likoni hall ' })]);
ok('the same venue is pointed out', c.get('a')![0].sameVenue && c.get('a')![0].reasons.some((r) => /venue/.test(r)), c.get('a'));

c = findClashes([T('a', wk, ['ann'], { status: 'requested' }), T('b', wk, ['bob'])]);
ok('a tentative overlap says so', c.get('b')![0].tentative === true);

const weeks = monthWeeks('2026-11-15');
ok('the November 2026 grid starts on a Monday and ends on a Sunday', weeks[0][0] === '2026-10-26' && weeks[weeks.length - 1][6] === '2026-12-06' && weeks.length === 6, [weeks[0][0], weeks.at(-1)![6], weeks.length]);
ok('addDays crosses a month end', addDays('2026-11-30', 1) === '2026-12-01');

// ---- phone calendar text
const clashes = findClashes([T('a', wk, ['ann'], { venue: 'Hall, Likoni' }), T('b', wk, ['bob'])]);
const ics = icsCalendar('Elimu+ trainings', trainingEvents([T('a', wk, ['ann'], { venue: 'Hall, Likoni' })], clashes, 'https://portal.elimuplus.com'), new Date('2026-11-07T20:00:00Z'));
ok('the feed is a calendar with CRLF lines', ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n') && !/[^\r]\n/.test(ics));
ok('each training day is its own all-day event', (ics.match(/BEGIN:VEVENT/g) ?? []).length === 5 && ics.includes('DTSTART;VALUE=DATE:20261109') && ics.includes('DTEND;VALUE=DATE:20261110'));
ok('commas in a venue are escaped', ics.includes('LOCATION:Hall\\, Likoni'));
ok('a clash shows in the title and the notes', /SUMMARY:.*overlaps another training/.test(ics.replace(/\r\n /g, '')) && ics.replace(/\r\n /g, '').includes('Overlaps Cohort b'));
ok('no line is longer than 75 bytes', ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75), ics.split('\r\n').find((l) => l.length > 75));
ok('event ids are stable', ics.includes('UID:a-day1@portal.elimuplus.com'));
const timed = icsCalendar('x', trainingEvents([T('t', ['2026-11-09'], ['ann'], { startTime: '09:00', endTime: '16:30', timeNote: 'lunch 13:00' })], new Map(), 'https://p'), new Date('2026-11-07T20:00:00Z'));
ok('an agreed time makes a timed event, converted from East Africa Time', timed.includes('DTSTART:20261109T060000Z') && timed.includes('DTEND:20261109T133000Z') && !timed.includes('VALUE=DATE'), timed);
ok('an early start rolls back to the previous UTC day', icsCalendar('x', trainingEvents([T('t', ['2026-11-09'], ['ann'], { startTime: '01:30', endTime: '02:30' })], new Map(), 'https://p')).includes('DTSTART:20261108T223000Z'));
ok('the time and note are in the description', timed.replace(/\r\n /g, '').includes('Time: 09:00 to 16:30 (East Africa Time)\\, lunch 13:00'));
ok('no time means an all-day entry and says so', ics.includes('DTSTART;VALUE=DATE') && ics.replace(/\r\n /g, '').includes('Time not agreed yet'));
ok('the feed carries no money', !/invoice|KES|amount/i.test(ics));

// ---- database access
const db = new PGlite();
await db.exec(`create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(coalesce(current_setting('request.jwt.claim.sub', true), current_setting('request.jwt.sub', true)),'')::uuid $$;
  create role authenticated; create role anon;`);
for (const f of readdirSync('supabase/migrations').filter((x) => /^00(0[1-9]|[1-9]\d)/.test(x) && x.endsWith('.sql')).sort()) {
  if (/^(0005|0011|0020a)/.test(f)) continue;
  try { await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8')); } catch (e: any) { if (!/already exists|does not exist/.test(String(e.message))) throw new Error(`${f}: ${e.message}`); }
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
const P = (n: number) => `00000000-0000-4000-8000-000000000${n}`;
const who: Record<string, string> = { founder: P(101), lead: P(202), fac: P(203), fac2: P(204), observer: P(205), participant: P(301), org: P(401) };
async function as(person: string, sql: string, params: any[] = []) {
  const aid = (await db.query<any>('select auth_user_id from public.people where id = $1', [who[person]])).rows[0].auth_user_id;
  await db.exec(`reset role; set request.jwt.sub = '${aid}'; set role authenticated;`);
  try { return (await db.query<any>(sql, params)).rows; } finally { await db.exec('reset role;'); }
}
const err = async (p: string, sql: string, params: any[] = []) => { try { await as(p, sql, params); return null; } catch (e: any) { return e.message as string; } };

const feedToken = 'f'.repeat(40);
ok('a trainer can make their own feed address', (await err('fac', `insert into calendar_feeds(person_id, token) values ('${who.fac}', '${feedToken}')`)) === null);
ok('a trainer cannot make an address for someone else', (await err('fac', `insert into calendar_feeds(person_id, token) values ('${who.fac2}', '${'g'.repeat(40)}')`)) !== null);
ok('nobody else can read the address', (await as('fac2', 'select token from calendar_feeds')).length === 0 && (await as('founder', 'select token from calendar_feeds')).length === 0);
ok('a trainer can read their own', (await as('fac', 'select token from calendar_feeds')).length === 1);
ok('short tokens are refused', (await err('fac2', `insert into calendar_feeds(person_id, token) values ('${who.fac2}', 'short')`)) !== null);

const cohorts = await as('founder', 'select id from cohorts order by seq limit 2');
ok('the seed has two cohorts to pair', cohorts.length === 2);
const [x, y] = cohorts.map((r: any) => r.id).sort();
ok('a founder can confirm an overlap', (await err('founder', `insert into calendar_clash_confirmations(cohort_a, cohort_b, confirmed_by) values ('${x}','${y}','${who.founder}')`)) === null);
ok('a pair must be stored in order, once', (await err('founder', `insert into calendar_clash_confirmations(cohort_a, cohort_b) values ('${y}','${x}')`)) !== null);
ok('a trainer cannot confirm an overlap', (await err('fac2', `insert into calendar_clash_confirmations(cohort_a, cohort_b) values ('${x}','${y}') on conflict do nothing`)) !== null);
ok('a partner administrator cannot read confirmations', (await as('org', 'select * from calendar_clash_confirmations')).length === 0);
ok('a founder can withdraw it', (await err('founder', `delete from calendar_clash_confirmations where cohort_a='${x}' and cohort_b='${y}'`)) === null && (await as('founder', 'select * from calendar_clash_confirmations')).length === 0);

const founderSees = (await as('founder', 'select id from cohorts')).length;
const facSees = (await as('fac', 'select id from cohorts')).length;
ok('a trainer sees no more trainings than a founder, and only their own', facSees <= founderSees && facSees === (await as('fac', 'select cohort_id from cohort_facilitators where person_id = app.me()')).length, [facSees, founderSees]);
ok('a trainer cannot read invoices', (await as('fac', 'select id from invoices')).length === 0);

// ---- agreed times
const c501 = '00000000-0000-4000-8000-000000000501', c502 = '00000000-0000-4000-8000-000000000502';
const setT = (p: string, c: string, a: string | null, b: string | null) => err(p, 'select app.set_training_time($1::uuid, $2::time, $3::time, $4)', [c, a, b, 'lunch 13:00']);
ok('a lead trainer can set the time of their training', (await setT('lead', c501, '09:00', '16:00')) === null);
ok('the time was saved', (await as('founder', 'select daily_start::text s, daily_end::text e, time_note n from cohorts where id=$1', [c501]))[0].s === '09:00:00');
ok('a co-facilitator can too', (await setT('fac', c501, '08:30', '15:30')) === null);
ok('an observer cannot', (await setT('observer', c502, '09:00', '16:00')) !== null);
ok('a trainer on another training cannot', (await setT('fac', c502, '09:00', '16:00')) !== null);
ok('a participant cannot', (await setT('participant', c501, '09:00', '16:00')) !== null);
ok('a founder can set any training', (await setT('founder', c502, '10:00', '17:00')) === null);
ok('one time without the other is refused', (await setT('founder', c502, '10:00', null)) !== null);
ok('an end before the start is refused', (await setT('founder', c502, '16:00', '10:00')) !== null);
ok('clearing both removes the time', (await setT('founder', c502, null, null)) === null && (await as('founder', 'select daily_start from cohorts where id=$1', [c502]))[0].daily_start === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
