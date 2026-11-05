'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asAdmin } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { removeSessionFiles } from '@/lib/session-photos-admin';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const back = (to: string, msg: string): never => redirect(`${to}${to.includes('?') ? '&' : '?'}ok=${encodeURIComponent(msg)}`);

/** A founder checks the photo (no faces, nothing private in view) and releases it to the partner. */
export async function approveSessionPhoto(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'photo'), to = s(f, 'back') || '/portal/approvals';
  await asAdmin((q) => q("update session_photos set status='approved', approved_by=$2, approved_at=now() where id=$1", [id, me.id]));
  await audit(me.id, 'approved a session photo', 'session_photos');
  revalidatePath('/portal', 'layout');
  back(to, 'Photo approved. The partner can now see it.');
}

/** Removes a photo: a founder any photo, a trainer their own photo while it is still waiting. */
export async function removeSessionPhoto(f: FormData) {
  const me = await requireMe('facilitator', 'founder');
  const id = s(f, 'photo'), to = s(f, 'back') || '/portal/approvals';
  const row = (await asAdmin((q) => q('select storage_path, uploaded_by, status from session_photos where id=$1', [id])))[0];
  if (!row) back(to, 'That photo is already gone.');
  if (!me.roles.includes('founder') && !(row.uploaded_by === me.id && row.status === 'pending')) back(to, 'You can only remove your own photo while it is waiting for approval.');
  await asAdmin((q) => q('delete from session_photos where id=$1', [id]));
  await removeSessionFiles([row.storage_path]);
  await audit(me.id, 'removed a session photo', 'session_photos');
  revalidatePath('/portal', 'layout');
  back(to, 'Photo removed.');
}
