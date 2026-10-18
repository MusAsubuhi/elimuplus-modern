'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asAdmin } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { ANGLES, PLATFORMS } from '@/lib/social';

const P = '/portal/social';
const back = (msg: string, kind: 'ok' | 'err' = 'ok'): never => redirect(`${P}?${kind}=${encodeURIComponent(msg)}`);
const s = (f: FormData, k: string, n = 2000) => String(f.get(k) ?? '').trim().slice(0, n);
const isUrl = (u: string) => !u || /^https:\/\/\S+$/.test(u);

export async function submitIdea(f: FormData) {
  const me = await requireMe('founder', 'facilitator');
  const title = s(f, 'title', 160), angle = s(f, 'angle', 20), material = s(f, 'material', 4000);
  if (!title || !material || !ANGLES.some((a) => a.key === angle)) back('Please give a title, an angle and the real material behind the idea.', 'err');
  if (f.get('consent') !== 'on') back('Please confirm that nobody is named or shown without their consent.', 'err');
  const logo = s(f, 'partner_logo_url', 300), image = s(f, 'image_url', 300);
  if (!isUrl(logo) || !isUrl(image)) back('Picture and logo addresses must start with https://', 'err');
  await asAdmin((q) => q(
    `insert into social_ideas (title, angle, material, consent_ok, author_id, partner_name, partner_logo_url, image_url) values ($1,$2,$3,true,$4,$5,$6,$7)`,
    [title, angle, material, me.id, s(f, 'partner_name', 120) || null, logo || null, image || null]));
  await audit(me.id, 'social idea submitted', 'social_ideas');
  revalidatePath(P);
  back('Thank you. Your idea is in the bank; the founders will turn it into posts.');
}

/** Founders write or edit the four platform versions. Editing an approved post sends it back for approval. */
export async function saveDrafts(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'id', 40);
  const drafts: Record<string, string> = {};
  for (const p of PLATFORMS) drafts[p.key] = s(f, p.key, 3000);
  await asAdmin(async (q) => {
    await q(`update social_ideas set drafts=$2, image_url=$3, partner_name=$4, partner_logo_url=$5,
             status = case when status in ('approved','pending') then 'pending' else status end, return_note=null where id=$1`,
      [id, JSON.stringify(drafts), s(f, 'image_url', 300) || null, s(f, 'partner_name', 120) || null, s(f, 'partner_logo_url', 300) || null]);
    await q('delete from social_approvals where idea_id=$1', [id]);
  });
  await audit(me.id, 'social drafts saved', 'social_ideas');
  revalidatePath(P);
  back('Drafts saved.');
}

export async function sendForApproval(f: FormData) {
  const me = await requireMe('founder');
  await asAdmin(async (q) => {
    await q(`update social_ideas set status='pending', return_note=null where id=$1`, [s(f, 'id', 40)]);
    await q('delete from social_approvals where idea_id=$1', [s(f, 'id', 40)]);
  });
  await audit(me.id, 'social sent for approval', 'social_ideas');
  revalidatePath(P);
  back('Sent for approval. Both founders need to approve it.');
}

/** Each founder approves once; the post is approved when two different founders have. */
export async function approveIdea(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'id', 40);
  const msg = await asAdmin(async (q) => {
    await q('insert into social_approvals (idea_id, person_id) values ($1,$2) on conflict do nothing', [id, me.id]);
    const need = Math.min(2, Number((await q(`select count(distinct person_id)::int n from role_assignments where role='founder' and status='active'`))[0].n) || 1);
    const have = Number((await q('select count(*)::int n from social_approvals where idea_id=$1', [id]))[0].n);
    if (have >= need) { await q(`update social_ideas set status='approved' where id=$1 and status='pending'`, [id]); return 'Approved by both founders. It is ready to post.'; }
    return 'Your approval is recorded. Waiting for the other founder.';
  });
  await audit(me.id, 'social approved', 'social_ideas');
  revalidatePath(P);
  back(msg);
}

export async function returnIdea(f: FormData) {
  const me = await requireMe('founder');
  await asAdmin(async (q) => {
    await q(`update social_ideas set status='returned', return_note=$2 where id=$1`, [s(f, 'id', 40), s(f, 'note', 500) || 'Please add more real detail.']);
    await q('delete from social_approvals where idea_id=$1', [s(f, 'id', 40)]);
  });
  await audit(me.id, 'social returned', 'social_ideas');
  revalidatePath(P);
  back('Returned to the author with your note.');
}

export async function markPosted(f: FormData) {
  const me = await requireMe('founder');
  await asAdmin((q) => q(`update social_ideas set status='posted', posted_at=now() where id=$1 and status='approved'`, [s(f, 'id', 40)]));
  await audit(me.id, 'social marked posted', 'social_ideas');
  revalidatePath(P);
  back('Marked as posted.');
}

/** Authors can fix their own idea while it is in the bank or after it was returned; it goes back to the founders as a fresh idea. */
export async function editMyIdea(f: FormData) {
  const me = await requireMe('founder', 'facilitator');
  const id = s(f, 'id', 40), title = s(f, 'title', 160), angle = s(f, 'angle', 20), material = s(f, 'material', 4000);
  if (!title || !material || !ANGLES.some((a) => a.key === angle)) back('Please keep a title, an angle and the real material.', 'err');
  const logo = s(f, 'partner_logo_url', 300), image = s(f, 'image_url', 300);
  if (!isUrl(logo) || !isUrl(image)) back('Picture and logo addresses must start with https://', 'err');
  const done = await asAdmin((q) => q(
    `update social_ideas set title=$3, angle=$4, material=$5, partner_name=$6, partner_logo_url=$7, image_url=$8, status='idea', return_note=null
     where id=$1 and author_id=$2 and status in ('idea','returned') returning id`,
    [id, me.id, title, angle, material, s(f, 'partner_name', 120) || null, logo || null, image || null]));
  if (!done.length) back('That idea can no longer be edited because it is already with the founders for approval.', 'err');
  await audit(me.id, 'social idea edited', 'social_ideas');
  revalidatePath(P);
  back('Saved. The founders will see your updated idea.');
}
