'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asAdmin } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { DELEGABLE_ROLES, featureByKey } from '@/lib/features';

const P = '/portal/permissions';
const back = (msg: string, kind: 'ok' | 'err' = 'ok'): never => redirect(`${P}?${kind}=${encodeURIComponent(msg)}`);
const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/** Saves the role-by-section grid in one go: each cell is a checkbox named role:feature. */
export async function saveRoleGrid(f: FormData) {
  const me = await requireMe('founder');
  const rows: [string, string, boolean][] = [];
  for (const [k, v] of f.entries()) {
    if (!k.startsWith('seen:')) continue;
    const [, role, feature] = k.split(':');
    const def = featureByKey(feature);
    if (!def?.delegable || !DELEGABLE_ROLES.includes(role as any)) continue;
    rows.push([role, feature, f.get(`cell:${role}:${feature}`) === 'on']);
  }
  await asAdmin(async (q) => {
    for (const [role, feature, allowed] of rows)
      await q('insert into role_features (role, feature, allowed) values ($1,$2,$3) on conflict (role, feature) do update set allowed = $3', [role, feature, allowed]);
  });
  await audit(me.id, 'permissions: role defaults saved', 'role_features');
  revalidatePath('/portal', 'layout');
  back('Role permissions saved.');
}

export async function setPersonFeature(f: FormData) {
  const me = await requireMe('founder');
  const person = s(f, 'person'), feature = s(f, 'feature'), mode = s(f, 'mode');
  if (!person || !featureByKey(feature)?.delegable) back('Choose a person and a section that can be shared.', 'err');
  await asAdmin(async (q) => {
    if (mode === 'default') await q('delete from person_features where person_id=$1 and feature=$2', [person, feature]);
    else await q('insert into person_features (person_id, feature, allowed) values ($1,$2,$3) on conflict (person_id, feature) do update set allowed=$3', [person, feature, mode === 'allow']);
  });
  await audit(me.id, `permissions: ${feature} ${mode} for a person`, 'person_features');
  revalidatePath('/portal', 'layout');
  back(mode === 'default' ? 'Back to the role default.' : mode === 'allow' ? 'Access given.' : 'Access removed.');
}
