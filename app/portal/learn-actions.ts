'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asAdmin, asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { AUDIENCES, MAX_PDF_BYTES, TOPICS, cleanUrl, fileExists, prepareUpload, removeFile } from '@/lib/learning';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const dateOrNull = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const go = (to: string, msg: string, kind: 'ok' | 'err' = 'ok'): never => redirect(`${to}${to.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(msg)}&n=${Date.now()}`);
const audienceOf = (f: FormData) => f.getAll('audience').map(String).filter((a) => a in AUDIENCES);

/** Step one of adding a PDF: a founder asks where to put the file. The browser then sends the file straight to storage, so large files work. */
export async function prepareLearningUpload(fileName: string, size: number): Promise<{ ok: true; mode: 'supabase' | 'local'; path: string; token?: string } | { ok: false; error: string }> {
  await requireMe('founder');
  if (!/\.pdf$/i.test(fileName)) return { ok: false, error: 'Only PDF files can be added here. Use a link for anything else.' };
  if (!(size > 0) || size > MAX_PDF_BYTES) return { ok: false, error: 'The file must be a PDF of up to 50 MB.' };
  try { return { ok: true, ...(await prepareUpload(fileName)) }; } catch (e: any) { return { ok: false, error: String(e?.message ?? 'Could not prepare the upload.') }; }
}

/** Adds a PDF (already uploaded) or a link to the library. Founders only. */
export async function addResource(f: FormData) {
  const me = await requireMe('founder');
  const to = '/portal/learn';
  const title = s(f, 'title'), kind = ['pdf', 'link', 'video'].includes(s(f, 'kind')) ? s(f, 'kind') : 'link';
  if (!title) go(to, 'Give it a title.', 'err');
  const audience = audienceOf(f);
  if (!audience.length) go(to, 'Choose at least one group it is for.', 'err');
  const topic = s(f, 'topic') in TOPICS ? s(f, 'topic') : 'general';
  const status = s(f, 'status') === 'draft' ? 'draft' : 'published';
  let url: string | null = null, path: string | null = null;
  if (kind === 'pdf') {
    path = s(f, 'storage_path');
    if (!path.startsWith('resources/') || !(await fileExists(path))) go(to, 'The file did not arrive. Please choose it and try again.', 'err');
  } else {
    url = cleanUrl(s(f, 'url'));
    if (!url) go(to, 'Paste a full web link that starts with https://', 'err');
  }
  await asUser(me.id, (q) => q(
    `insert into learning_resources(title,description,kind,topic,url,storage_path,file_name,size_bytes,audience,required,due_on,status,added_by)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [title, s(f, 'description') || null, kind, topic, url, path, s(f, 'file_name') || null, Number(s(f, 'size_bytes')) || null, audience, s(f, 'required') === 'on', dateOrNull(s(f, 'due_on')), status, me.id]));
  await audit(me.id, 'added a learning resource', 'learning_resources');
  revalidatePath('/portal/learn');
  go(to, status === 'draft' ? 'Saved as a draft. Only founders can see it until you publish it.' : 'Added to the library.');
}

export async function updateResource(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'id'), to = s(f, 'back') || '/portal/learn';
  const title = s(f, 'title'), audience = audienceOf(f);
  if (!title || !audience.length) go(to, 'A title and at least one group are needed.', 'err');
  const status = ['draft', 'published', 'archived'].includes(s(f, 'status')) ? s(f, 'status') : 'published';
  await asUser(me.id, (q) => q(
    `update learning_resources set title=$2, description=$3, topic=$4, audience=$5, required=$6, due_on=$7, status=$8, updated_at=now() where id=$1`,
    [id, title, s(f, 'description') || null, s(f, 'topic') in TOPICS ? s(f, 'topic') : 'general', audience, s(f, 'required') === 'on', dateOrNull(s(f, 'due_on')), status]));
  await audit(me.id, 'changed a learning resource', 'learning_resources');
  revalidatePath('/portal/learn');
  go(to, 'Saved.');
}

/** Removes an archived resource and its file. Anything people have completed is removed with it. */
export async function deleteResource(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'id'), to = s(f, 'back') || '/portal/learn';
  const row = (await asUser(me.id, (q) => q('select storage_path, status from learning_resources where id=$1', [id])))[0];
  if (!row) go(to, 'That item is already gone.', 'err');
  if (row.status !== 'archived') go(to, 'Archive it first, then it can be removed for good.', 'err');
  await asUser(me.id, (q) => q('delete from learning_resources where id=$1', [id]));
  if (row.storage_path) await removeFile(row.storage_path);
  await audit(me.id, 'removed a learning resource', 'learning_resources');
  revalidatePath('/portal/learn');
  go('/portal/learn', 'Removed.');
}

/** "I have read this" (or take it back). Anyone who can see the resource can mark it. */
export async function setCompletion(f: FormData) {
  const me = await requireMe();
  const id = s(f, 'id'), to = s(f, 'back') || `/portal/learn/${id}`;
  const done = s(f, 'done') !== 'no';
  try {
    await asUser(me.id, (q) => done
      ? q('insert into learning_completions(resource_id,person_id) values($1,$2) on conflict (resource_id,person_id) do nothing', [id, me.id])
      : q('delete from learning_completions where resource_id=$1 and person_id=$2', [id, me.id]));
  } catch { go(to, 'That item is not available to you.', 'err'); }
  revalidatePath('/portal/learn'); revalidatePath('/portal/plan');
  go(to, done ? 'Marked as done.' : 'Marked as not done.');
}

/** Client-side version used by the reader when someone reaches the last page and presses the button. */
export async function completeFromReader(id: string): Promise<boolean> {
  const me = await requireMe();
  try { await asUser(me.id, (q) => q('insert into learning_completions(resource_id,person_id) values($1,$2) on conflict (resource_id,person_id) do nothing', [id, me.id])); }
  catch { return false; }
  revalidatePath('/portal/learn'); revalidatePath('/portal/plan');
  return true;
}

/** Point a goal at a resource that helps with it. The plan's owner, their reviewer and the founders can do this. */
export async function attachResource(f: FormData) {
  const me = await requireMe();
  const goal = s(f, 'goal'), resource = s(f, 'resource'), back = s(f, 'back') || '/portal/plan';
  if (!goal || !resource) go(back, 'Choose a resource first.', 'err');
  try { await asUser(me.id, (q) => q('insert into goal_resources(goal_id,resource_id,added_by) values($1,$2,$3) on conflict do nothing', [goal, resource, me.id])); }
  catch { go(back, 'You cannot add that to this goal.', 'err'); }
  revalidatePath('/portal/plan');
  go(back, 'Resource added to the goal.');
}

export async function detachResource(f: FormData) {
  const me = await requireMe();
  const goal = s(f, 'goal'), resource = s(f, 'resource'), back = s(f, 'back') || '/portal/plan';
  await asUser(me.id, (q) => q('delete from goal_resources where goal_id=$1 and resource_id=$2', [goal, resource])).catch(() => []);
  revalidatePath('/portal/plan');
  go(back, 'Resource removed from the goal.');
}

export async function uncompleteFromReader(id: string): Promise<boolean> {
  const me = await requireMe();
  try { await asUser(me.id, (q) => q('delete from learning_completions where resource_id=$1 and person_id=$2', [id, me.id])); }
  catch { return false; }
  revalidatePath('/portal/learn'); revalidatePath('/portal/plan');
  return true;
}
