import 'server-only';
import { redirect } from 'next/navigation';
import { asAdmin } from './db';
import { getMe, type Me } from './session';
import { FEATURES, featureByKey, type Level } from './features';

const cap = (key: string, lvl: Level): Level => (featureByKey(key)?.maxLevel === 'view' ? 'view' : lvl);
const higher = (a: Level, b: Level): Level => (a === 'edit' || b === 'edit' ? 'edit' : 'view');

/**
 * The sections this person may use, each with the level they have: 'view' (read only) or 'edit'.
 * Founders get everything at edit. Others: their own override first, else the best of what their roles allow.
 */
export async function allowedFeatures(me: Me): Promise<Map<string, Level>> {
  if (me.roles.includes('founder')) return new Map(FEATURES.map((f) => [f.key, cap(f.key, 'edit')]));
  const [roleRows, personRows] = await asAdmin(async (q) => [
    await q('select role, feature, allowed, level from role_features').catch(() => []),
    await q('select feature, allowed, level from person_features where person_id=$1', [me.id]).catch(() => []),
  ]);
  const out = new Map<string, Level>();
  for (const f of FEATURES) {
    if (!f.delegable) { if (me.roles.some((r) => f.roles.includes(r))) out.set(f.key, 'edit'); continue; }
    const own = personRows.find((r: any) => r.feature === f.key);
    if (own) { if (own.allowed) out.set(f.key, cap(f.key, own.level === 'view' ? 'view' : 'edit')); continue; }
    let best: Level | null = null;
    for (const r of me.roles) {
      const row = roleRows.find((x: any) => x.role === r && x.feature === f.key);
      const on = row ? !!row.allowed : f.roles.includes(r);
      if (!on) continue;
      const lvl: Level = row ? (row.level === 'view' ? 'view' : 'edit') : (f.levelDefault?.[r] ?? 'edit');
      best = best ? higher(best, lvl) : lvl;
    }
    if (best) out.set(f.key, cap(f.key, best));
  }
  return out;
}

/**
 * Page and action guard for a section. need='view' lets read-only people in; need='edit' (use this in every action that
 * changes data) sends view-only people back to the section with a message.
 */
export async function requireFeature(key: string, need: Level = 'view'): Promise<Me> {
  const me = await getMe();
  if (!me) redirect('/portal/login');
  const def = featureByKey(key);
  if (!def) redirect('/portal');
  const level = (await allowedFeatures(me)).get(key);
  if (!level) redirect('/portal');
  if (need === 'edit' && level !== 'edit') redirect(`${def.href}?err=${encodeURIComponent('You can view this section but not change it.')}`);
  return me;
}

/** For pages: whether this person may change things here, so forms and buttons can be hidden when they may only look. */
export async function featureLevel(me: Me, key: string): Promise<Level | null> {
  return (await allowedFeatures(me)).get(key) ?? null;
}
