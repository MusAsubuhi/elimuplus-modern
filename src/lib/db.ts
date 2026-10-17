import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export type Row = Record<string, any>;
export type Q = (sql: string, params?: any[]) => Promise<Row[]>;

type Driver = {
  mode: 'demo' | 'pg';
  as<T>(personId: string | null, fn: (q: Q) => Promise<T>): Promise<T>;
  admin<T>(fn: (q: Q) => Promise<T>): Promise<T>;
};

const g = globalThis as unknown as { __elimuDb?: Promise<Driver> };

/** Sets the signed-in identity for row level security from a profile id (runs before switching role). */
const AUTH_SUB =
  "select set_config('request.jwt.claim.sub', coalesce((select auth_user_id::text from public.people where id = $1::uuid), $1::text), true)";

async function makeDemo(): Promise<Driver> {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const sql = (f: string) => readFileSync(path.join(process.cwd(), 'supabase', f), 'utf8');
  await db.exec(`
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(coalesce(current_setting('request.jwt.claim.sub', true), ''), '')::uuid $$;
    create role authenticated; create role anon;
  `);
  await db.exec(sql('migrations/0001_schema.sql'));
  await db.exec(sql('migrations/0002_rls.sql'));
  await db.exec(sql('migrations/0003_partner_aggregates.sql'));
  await db.exec(sql('migrations/0004_function_search_path.sql'));
  await db.exec(sql('migrations/0006_team_suggestions_journey.sql'));
  await db.exec(sql('migrations/0007_levels_crm_reports_alerts.sql'));
  await db.exec(sql('migrations/0008_followup_forms.sql'));
  await db.exec(sql('migrations/0009_impact_data.sql'));
  await db.exec(sql('migrations/0010_form_registry.sql'));
  await db.exec(sql('seed.sql'));
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
  const wrap = (tx: any): Q => async (s, p = []) => (await tx.query(s, p)).rows as Row[];
  return {
    mode: 'demo',
    async as(personId, fn) {
      return db.transaction(async (tx) => {
        if (personId) {
          // Row level security knows people by their login id (auth.uid()), not by their profile id.
          await tx.query(AUTH_SUB, [personId]);
          await tx.exec('set local role authenticated');
        }
        return fn(wrap(tx));
      });
    },
    async admin(fn) {
      return db.transaction(async (tx) => fn(wrap(tx)));
    },
  };
}

async function makePg(): Promise<Driver> {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  const run = async <T,>(setup: string[], params: any[][], fn: (q: Q) => Promise<T>) => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      for (let i = 0; i < setup.length; i++) await c.query(setup[i], params[i]);
      const out = await fn(async (s, p = []) => (await c.query(s, p)).rows as Row[]);
      await c.query('commit');
      return out;
    } catch (e) {
      await c.query('rollback').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  };
  return {
    mode: 'pg',
    as: (personId, fn) =>
      personId
        ? run([AUTH_SUB, 'set local role authenticated'], [[personId], []], fn)
        : run([], [], fn),
    admin: (fn) => run([], [], fn),
  };
}

export function driver(): Promise<Driver> {
  if (!g.__elimuDb) g.__elimuDb = process.env.DATABASE_URL ? makePg() : makeDemo();
  return g.__elimuDb;
}

/** Run queries as a signed-in person: row level security applies. */
export async function asUser<T>(personId: string, fn: (q: Q) => Promise<T>): Promise<T> {
  return (await driver()).as(personId, fn);
}
/** Trusted server-side access (sign-in lookups, audit writes). Never expose results unfiltered. */
export async function asAdmin<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  return (await driver()).admin(fn);
}
export async function dbMode() {
  return (await driver()).mode;
}
