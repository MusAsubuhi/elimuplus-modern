import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { asAdmin, asUser, dbMode } from './db';

export type Role = 'founder' | 'master' | 'facilitator' | 'org_admin' | 'participant';
export type Lang = 'sw' | 'en';

export interface Me {
  id: string;
  name: string;
  displayName: string;
  language: Lang;
  birthYear: number | null;
  roles: Role[];
  primary: Role;
  tier: number;
  orgIds: string[];
  demo: boolean;
}

const ORDER: Role[] = ['founder', 'master', 'facilitator', 'org_admin', 'participant'];

async function personIdFromCookie(): Promise<string | null> {
  const jar = await cookies();
  if ((await dbMode()) === 'demo') return jar.get('elimu_demo')?.value ?? null;
  // Production: Supabase session cookie -> auth user -> person.
  const { createServerClient } = await import('@supabase/ssr');
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => jar.getAll(), setAll: () => {} },
  });
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  const rows = await asAdmin((q) => q('select id from people where auth_user_id = $1', [data.user!.id]));
  return rows[0]?.id ?? null;
}

export async function getMe(): Promise<Me | null> {
  const id = await personIdFromCookie();
  if (!id) return null;
  const info = await asAdmin(async (q) => {
    const p = (await q('select * from people where id=$1', [id]))[0];
    if (!p) return null;
    const ra = await q(
      `select role, tier, organisation_id from role_assignments
       where person_id=$1 and status='active' and (end_date is null or end_date >= current_date)`, [id]);
    return { p, ra };
  });
  if (!info) return null;
  const { p, ra } = info;
  const tier = Math.max(0, ...ra.filter((r) => r.role === 'facilitator').map((r) => r.tier ?? 0));
  const roles = new Set<Role>();
  for (const r of ra) {
    if (r.role === 'founder') roles.add('founder');
    if (r.role === 'facilitator') { roles.add('facilitator'); if ((r.tier ?? 0) >= 3) roles.add('master'); }
    if (r.role === 'org_admin' || r.role === 'org_viewer') roles.add('org_admin');
    if (r.role === 'participant') roles.add('participant');
  }
  const list = ORDER.filter((r) => roles.has(r));
  return {
    id, name: p.full_name, displayName: p.display_name || p.full_name,
    language: p.preferred_language, birthYear: p.birth_year,
    roles: list, primary: list[0] ?? 'participant', tier,
    orgIds: ra.filter((r) => r.organisation_id).map((r) => r.organisation_id),
    demo: (await dbMode()) === 'demo',
  };
}

export async function requireMe(...allowed: Role[]): Promise<Me> {
  const me = await getMe();
  if (!me) redirect('/portal/login');
  if (allowed.length && !me.roles.some((r) => allowed.includes(r))) redirect('/portal');
  return me;
}

export async function getLang(me?: Me | null): Promise<Lang> {
  const c = (await cookies()).get('elimu_lang')?.value;
  if (c === 'sw' || c === 'en') return c;
  return me?.language ?? 'en';
}

export { asUser };
