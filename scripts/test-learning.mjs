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
const who = { founder: P(101), master: P(201), fac: P(203), fac2: P(204), participant: P(301), org: P(401) };
async function as(person, sql) {
  const aid = (await db.query('select auth_user_id from public.people where id = $1', [who[person]])).rows[0].auth_user_id;
  await db.exec(`reset role; set request.jwt.sub = '${aid}'; set role authenticated;`);
  try { return (await db.query(sql)).rows; } finally { await db.exec('reset role;'); }
}
const err = async (p, sql) => { try { await as(p, sql); return null; } catch (e) { return e.message; } };
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  -> ' + x}`); };
const titles = async (p) => (await as(p, 'select title from learning_resources order by title')).map((r) => r.title).join('|');

const add = (t, aud, kind = 'link', status = 'published', req = false) =>
  `insert into learning_resources(title, kind, url, storage_path, audience, status, required, added_by) values ('${t}', '${kind}', ${kind === 'pdf' ? 'null' : `'https://example.org/${t}'`}, ${kind === 'pdf' ? `'resources/${t}.pdf'` : 'null'}, array[${aud.map((a) => `'${a}'`).join(',')}]::text[], '${status}', ${req}, '${who.founder}')`;

ok('a founder can add a PDF', (await err('founder', add('A', ['facilitator'], 'pdf', 'published', true))) === null);
ok('a founder can add a link for partner admins and participants', (await err('founder', add('B', ['participant', 'org_admin']))) === null);
ok('a founder can add a draft', (await err('founder', add('C', ['facilitator'], 'link', 'draft'))) === null);
ok('a founder can add one for master trainers only', (await err('founder', add('D', ['master']))) === null);
ok('a PDF without a stored file is refused', (await err('founder', `insert into learning_resources(title, kind, audience) values ('X','pdf',array['facilitator'])`)) !== null);
ok('a link without an address is refused', (await err('founder', `insert into learning_resources(title, kind, audience) values ('X','link',array['facilitator'])`)) !== null);

ok('founder sees everything including drafts', (await titles('founder')) === 'A|B|C|D', await titles('founder'));
ok('a facilitator sees only what is published for facilitators', (await titles('fac')) === 'A', await titles('fac'));
ok('a master trainer sees facilitator items and master items', (await titles('master')) === 'A|D', await titles('master'));
ok('a participant sees only participant items', (await titles('participant')) === 'B', await titles('participant'));
ok('a partner admin sees only partner items', (await titles('org')) === 'B', await titles('org'));

ok('a facilitator cannot add to the library', (await err('fac', add('Z', ['facilitator']))) !== null);
ok('a facilitator cannot change an item', (await as('fac', `update learning_resources set required=false where title='A' returning id`)).length === 0);
ok('a facilitator cannot remove an item', (await as('fac', `delete from learning_resources where title='A' returning id`)).length === 0);

const rid = async (t) => (await as('founder', `select id from learning_resources where title='${t}'`))[0].id;
const [A, B] = [await rid('A'), await rid('B')];
ok('a facilitator can mark their item done', (await err('fac', `insert into learning_completions(resource_id, person_id) values ('${A}','${who.fac}')`)) === null);
ok('marking the same item twice is refused', (await err('fac', `insert into learning_completions(resource_id, person_id) values ('${A}','${who.fac}')`)) !== null);
ok('a facilitator cannot mark an item that is not for them', (await err('fac', `insert into learning_completions(resource_id, person_id) values ('${B}','${who.fac}')`)) !== null);
ok('nobody can mark an item done for someone else', (await err('fac2', `insert into learning_completions(resource_id, person_id) values ('${A}','${who.fac2}')`)) === null && (await err('fac2', `insert into learning_completions(resource_id, person_id) values ('${A}','${who.fac}')`)) !== null);
ok('people see only their own completions', (await as('fac', 'select 1 from learning_completions')).length === 1 && (await as('fac2', 'select 1 from learning_completions')).length === 1);
ok('founders see everyone’s completions', (await as('founder', 'select 1 from learning_completions')).length === 2);
ok('a person can take their completion back', (await as('fac2', `delete from learning_completions where person_id='${who.fac2}' returning id`)).length === 1);

// goals
await db.exec(`reset role; insert into improvement_plans(id, person_id, title, created_by) values ('${P('b01')}', '${who.fac}', 'My plan', '${who.fac}');
  insert into improvement_goals(id, plan_id, title) values ('${P('b02')}', '${P('b01')}', 'Follow up better');`);
const G = P('b02');
ok('the plan owner can attach a resource that is for them', (await err('fac', `insert into goal_resources(goal_id, resource_id, added_by) values ('${G}','${A}','${who.fac}')`)) === null);
ok('a resource they cannot see cannot be attached', (await err('fac', `insert into goal_resources(goal_id, resource_id, added_by) values ('${G}','${B}','${who.fac}')`)) !== null);
ok('another facilitator cannot attach to someone else’s goal', (await err('fac2', `insert into goal_resources(goal_id, resource_id, added_by) values ('${G}','${A}','${who.fac2}')`)) !== null);
ok('another facilitator cannot read the link', (await as('fac2', 'select 1 from goal_resources')).length === 0);
ok('the owner reads the link', (await as('fac', 'select 1 from goal_resources')).length === 1);
ok('a founder reads the link and can remove it', (await as('founder', 'select 1 from goal_resources')).length === 1 && (await as('founder', `delete from goal_resources where goal_id='${G}' returning goal_id`)).length === 1);
ok('draft items vanish for everyone but founders once archived', (await err('founder', `update learning_resources set status='archived' where title='A'`)) === null && (await titles('fac')) === '');
ok('deleting a resource removes its completions', (await err('founder', `delete from learning_resources where title='A'`)) === null && (await as('founder', 'select 1 from learning_completions')).length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
