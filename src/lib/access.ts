import 'server-only';
import { redirect } from 'next/navigation';
import { asAdmin } from './db';
import { getMe, type Me } from './session';
import { FEATURES, featureByKey } from './features';

/** The set of feature keys this person may use: founders everything; others by their own override, else by what their roles allow. */
export async function allowedFeatures(me: Me): Promise<Set<string>> {
  if (me.roles.includes('founder')) return new Set(FEATURES.map((f) => f.key));
  const [roleRows, personRows] = await asAdmin(async (q) => [
    await q('select role, feature, allowed from role_features').catch(() => []),
    await q('select feature, allowed from person_features where person_id=$1', [me.id]).catch(() => []),
  ]);
  const out = new Set<string>();
  for (const f of FEATURES) {
    if (!f.delegable) { if (me.roles.some((r) => f.roles.includes(r))) out.add(f.key); continue; }
    const own = personRows.find((r: any) => r.feature === f.key);
    if (own) { if (own.allowed) out.add(f.key); continue; }
    const byRole = me.roles.map((r) => {
      const row = roleRows.find((x: any) => x.role === r && x.feature === f.key);
      return row ? !!row.allowed : f.roles.includes(r);
    });
    if (byRole.some(Boolean)) out.add(f.key);
  }
  return out;
}

/** Page and action guard for a section: sends people without access back to the portal home. */
export async function requireFeature(key: string): Promise<Me> {
  const me = await getMe();
  if (!me) redirect('/portal/login');
  if (!featureByKey(key)) redirect('/portal');
  if (!(await allowedFeatures(me)).has(key)) redirect('/portal');
  return me;
}
