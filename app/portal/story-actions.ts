'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asAdmin, asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { introLine, removeFiles } from '@/lib/stories';
import { supabaseAdmin } from '@/lib/supabase-admin';

const s = (f: FormData, k: string, n = 500) => String(f.get(k) ?? '').trim().slice(0, n);
const go = (path: string, msg: string, kind: 'ok' | 'err' = 'ok'): never => redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);
const idOf = (f: FormData) => { const v = s(f, 'id', 40); if (!/^[0-9a-f-]{36}$/i.test(v)) redirect('/portal/stories'); return v; };

/** Founders decide what happens to a story: use it with partners (approve), mark it as used publicly, or decline it. */
export async function reviewStory(f: FormData) {
  const me = await requireMe('founder');
  const id = idOf(f), P = `/portal/stories/${id}`;
  const act = s(f, 'act', 12);
  try {
    await asUser(me.id, async (q) => {
      const st = (await q(
        `select s.*, p.full_name, c.name cohort_name from participant_stories s join people p on p.id = s.person_id join cohorts c on c.id = s.cohort_id where s.id = $1`, [id]))[0];
      if (!st) throw new Error('missing');
      if (st.status === 'withdrawn') throw new Error('withdrawn');
      if (act === 'approve') {
        const shown = s(f, 'shown_name', 80) || introLine(st.consent_story, st.full_name, st.cohort_name);
        await q(`update participant_stories set status='approved', shown_name=$2, reviewed_by=$3, reviewed_at=now(), review_note=$4 where id=$1`, [id, shown, me.id, s(f, 'note', 400) || null]);
      } else if (act === 'publish') {
        if (st.status !== 'approved' && st.status !== 'published') throw new Error('approve first');
        await q(`update participant_stories set status='published', published_on=current_date, reviewed_by=$2, reviewed_at=now() where id=$1`, [id, me.id]);
      } else if (act === 'decline') {
        if (!s(f, 'note', 400)) throw new Error('note');
        await q(`update participant_stories set status='declined', reviewed_by=$2, reviewed_at=now(), review_note=$3 where id=$1`, [id, me.id, s(f, 'note', 400)]);
      } else throw new Error('act');
    });
  } catch (e: any) {
    const m = e?.message;
    go(P, m === 'note' ? 'Add a short note so the person knows why it was not used.' : m === 'approve first' ? 'Approve the story before marking it as published.' : m === 'withdrawn' ? 'The participant has withdrawn this story.' : 'Could not update the story.', 'err');
  }
  await audit(me.id, `story ${act}`, 'participant_stories');
  revalidatePath('/portal/stories'); revalidatePath(P);
  go(P, act === 'approve' ? 'Approved. Partners in this cohort can now see it.' : act === 'publish' ? 'Marked as published.' : 'Marked as not used.');
}

/** Withdrawing a story also removes its photos for good: consent can be taken back at any time. */
export async function withdrawStory(f: FormData) {
  const me = await requireMe('participant', 'facilitator', 'founder');
  const id = idOf(f), P = `/portal/stories/${id}`;
  const ok = (await asUser(me.id, (q) => q(`update participant_stories set status='withdrawn' where id=$1 returning id`, [id]).catch(() => []))).length > 0;
  if (!ok) go('/portal/stories', 'That story is not yours to withdraw.', 'err');
  const paths = await asAdmin(async (q) => {
    const rows = await q('select storage_path from story_photos where story_id=$1', [id]);
    await q('delete from story_photos where story_id=$1', [id]);
    return rows.map((r: any) => r.storage_path as string);
  });
  await removeFiles(paths).catch(() => {});
  await audit(me.id, 'story withdrawn', 'participant_stories');
  revalidatePath('/portal/stories');
  go('/portal/stories', 'The story and its photos have been withdrawn.');
}

export async function removeStoryPhoto(f: FormData) {
  const me = await requireMe('participant', 'facilitator', 'founder');
  const id = idOf(f), story = s(f, 'story', 40), P = `/portal/stories/${story}`;
  const ok = (await asUser(me.id, (q) => q(`update participant_stories set updated_at=updated_at where id=$1 returning id`, [story]).catch(() => []))).length > 0;
  if (!ok) go('/portal/stories', 'That story is not yours.', 'err');
  const path = await asAdmin(async (q) => (await q('delete from story_photos where id=$1 and story_id=$2 returning storage_path', [id, story]))[0]?.storage_path as string | undefined);
  if (path) await removeFiles([path]).catch(() => {});
  revalidatePath(P);
  go(P, 'Photo removed.');
}

/** Turn an approved story into an idea on the social board, so it follows the normal two-founder approval before posting. */
export async function storyToSocial(f: FormData) {
  const me = await requireMe('founder');
  const id = idOf(f), P = `/portal/stories/${id}`;
  const done = await asUser(me.id, async (q) => {
    const st = (await q('select * from participant_stories where id=$1', [id]))[0];
    if (!st || !['approved', 'published'].includes(st.status)) return null;
    if (st.social_idea_id) return 'exists';
    const idea = (await q(
      `insert into social_ideas(title, angle, material, consent_ok, author_id) values ($1,'aspirational',$2,true,$3) returning id`,
      [st.title || `A story from ${st.shown_name ?? 'a participant'}`,
        `${st.body}${st.quote ? `\n\nIn their words: “${st.quote}”` : ''}\n\nIntroduce as: ${st.shown_name ?? 'a participant'}. Consent: ${st.consent_story}${st.consent_photo ? ', photos allowed' : ', no photos'}.`, me.id]))[0];
    await q('update participant_stories set social_idea_id=$2 where id=$1', [id, idea.id]);
    return 'made';
  }).catch(() => null);
  if (!done) go(P, 'Approve the story before sending it to social.', 'err');
  await audit(me.id, 'story sent to social ideas', 'participant_stories');
  go(P, done === 'exists' ? 'It is already on the social board.' : 'Added to Social ideas as a draft. It still needs both founders’ approval before posting.');
}

/** Right to erasure: removes personal details, keeps the anonymous programme numbers. Founders only. */
export async function erasePerson(f: FormData) {
  const me = await requireMe('founder');
  const person = s(f, 'person', 40), cohort = s(f, 'cohort', 40), eid = s(f, 'eid', 40);
  const P = `/portal/cohorts/${cohort}/participants/${eid}`;
  if (s(f, 'confirm', 10) !== 'ERASE') go(P, 'Type ERASE in capital letters to confirm.', 'err');
  let res: any;
  try { res = (await asUser(me.id, (q) => q('select app.erase_person($1::uuid) r', [person])))[0]?.r; }
  catch (e: any) { console.error('[erase]', e); go(P, String(e?.message ?? '').replace(/^error: /i, '').slice(0, 160) || 'Could not erase this person.', 'err'); }
  await removeFiles((res?.photo_paths as string[]) ?? []).catch(() => {});
  if (res?.auth_user_id) await supabaseAdmin().auth.admin.deleteUser(res.auth_user_id).catch(() => {});
  await audit(me.id, 'participant erased on request', 'people');
  go(P, 'Personal details erased. The anonymous programme numbers are kept.');
}
