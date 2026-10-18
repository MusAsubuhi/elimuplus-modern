'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asAdmin, asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { DELEGABLE_ROLES, featureByKey } from '@/lib/features';

const P = '/portal/permissions';
const back = (msg: string, kind: 'ok' | 'err' = 'ok'): never => redirect(`${P}?${kind}=${encodeURIComponent(msg)}`);
const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

const LEVELS = ['none', 'view', 'edit'] as const;
const lvl = (v: unknown) => (LEVELS as readonly string[]).includes(String(v)) ? String(v) : 'none';

/** Saves the role-by-section grid in one go: each cell is a choice of none, view or edit. */
export async function saveRoleGrid(f: FormData) {
  const me = await requireMe('founder');
  const rows: [string, string, boolean, string][] = [];
  for (const [k] of f.entries()) {
    if (!k.startsWith('seen:')) continue;
    const [, role, feature] = k.split(':');
    const def = featureByKey(feature);
    if (!def?.delegable || !DELEGABLE_ROLES.includes(role as any)) continue;
    let v = lvl(f.get(`cell:${role}:${feature}`));
    if (def.maxLevel === 'view' && v === 'edit') v = 'view';
    rows.push([role, feature, v !== 'none', v === 'view' ? 'view' : 'edit']);
  }
  await asAdmin(async (q) => {
    for (const [role, feature, allowed, level] of rows)
      await q('insert into role_features (role, feature, allowed, level) values ($1,$2,$3,$4) on conflict (role, feature) do update set allowed=$3, level=$4', [role, feature, allowed, level]);
  });
  await audit(me.id, 'permissions: role defaults saved', 'role_features');
  revalidatePath('/portal', 'layout');
  back('Role permissions saved.');
}

export async function setPersonFeature(f: FormData) {
  const me = await requireMe('founder');
  const person = s(f, 'person'), feature = s(f, 'feature'), mode = s(f, 'mode');
  const def = featureByKey(feature);
  if (!person || !def?.delegable) back('Choose a person and a section that can be shared.', 'err');
  const level = mode === 'view' || def?.maxLevel === 'view' ? 'view' : 'edit';
  await asAdmin(async (q) => {
    if (mode === 'default') await q('delete from person_features where person_id=$1 and feature=$2', [person, feature]);
    else await q('insert into person_features (person_id, feature, allowed, level) values ($1,$2,$3,$4) on conflict (person_id, feature) do update set allowed=$3, level=$4', [person, feature, mode !== 'deny', level]);
  });
  await audit(me.id, `permissions: ${feature} ${mode} for a person`, 'person_features');
  revalidatePath('/portal', 'layout');
  back(mode === 'default' ? 'Back to the role default.' : mode === 'deny' ? 'Access removed.' : mode === 'view' ? 'View access given.' : 'Edit access given.');
}

/** What one partner organisation may see. Runs as the founder, so the database itself refuses anyone else. */
export async function saveAgreement(f: FormData) {
  const me = await requireMe('founder');
  const org = s(f, 'org');
  const named = ['none', 'aggregates', 'named'].includes(s(f, 'named')) ? s(f, 'named') : 'aggregates';
  const types = ['session', 'followup_30', 'followup_60', 'followup_90', 'completion', 'impact'].filter((t) => f.get(`type:${t}`) === 'on');
  if (!org) back('Choose an organisation.', 'err');
  try {
    await asUser(me.id, (q) => q(
      `insert into agreements (organisation_id, named_participant_access, welfare_flag_visibility, released_report_types)
       values ($1,$2,$3,$4) on conflict (organisation_id) do update set named_participant_access=$2, welfare_flag_visibility=$3, released_report_types=$4`,
      [org, named, f.get('welfare') === 'on', types]));
  } catch (e) { console.error('[portal action]', e); back('Could not save that agreement.', 'err'); }
  await audit(me.id, 'permissions: partner agreement saved', 'agreements');
  revalidatePath(P);
  back('Partner agreement saved.');
}
