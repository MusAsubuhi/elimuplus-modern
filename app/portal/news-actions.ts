'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { asAdmin } from '@/lib/db';
import { requireFeature } from '@/lib/access';
import { audit } from '@/lib/audit';

const P = '/portal/news';
const s = (f: FormData, k: string, n = 1000) => String(f.get(k) ?? '').trim().slice(0, n);
const go = (msg: string, kind: 'ok' | 'err', region = ''): never => redirect(`${P}?${kind}=${encodeURIComponent(msg)}${region ? `&r=${region}` : ''}`);

export async function addFollowup(f: FormData) {
  const me = await requireFeature('news', 'edit');
  const item = s(f, 'item', 40), note = s(f, 'note', 600), region = s(f, 'region', 20);
  if (!item || !note) go('Write what you want to follow up.', 'err', region);
  await asAdmin((q) => q('insert into news_followups (item_id, person_id, note) values ($1,$2,$3)', [item, me.id, note]));
  await audit(me.id, 'news follow-up added', 'news_followups');
  revalidatePath(P);
  go('Follow-up saved.', 'ok', region);
}

export async function finishFollowup(f: FormData) {
  const me = await requireFeature('news', 'edit');
  await asAdmin((q) => q(`update news_followups set status='done', done_at=now() where id=$1`, [s(f, 'id', 40)]));
  await audit(me.id, 'news follow-up done', 'news_followups');
  revalidatePath(P);
  go('Marked done.', 'ok', s(f, 'region', 20));
}

export async function hideNews(f: FormData) {
  const me = await requireFeature('news', 'edit');
  await asAdmin((q) => q('update news_items set hidden=true where id=$1', [s(f, 'item', 40)]));
  await audit(me.id, 'news item hidden', 'news_items');
  revalidatePath(P);
  go('Hidden.', 'ok', s(f, 'region', 20));
}

/** Turns a news item into an idea in the social bank (written in our own voice, with the source named), for the founders to draft and approve as usual. */
export async function newsToPost(f: FormData) {
  const me = await requireFeature('news', 'edit');
  await requireFeature('social', 'edit');
  const id = s(f, 'item', 40), region = s(f, 'region', 20);
  const item = (await asAdmin((q) => q('select * from news_items where id=$1', [id])))[0];
  if (!item) go('That item is no longer there.', 'err', region);
  if (item.social_idea_id) go('This item is already in the social ideas bank.', 'err', region);
  const material = [
    `News signal${item.source_name ? ` from ${item.source_name}` : ''}: ${item.summary || item.title}`,
    item.why_it_matters ? `Why it matters to Elimu+: ${item.why_it_matters}` : '',
    'Suggested angle: say what this means for a trader or young person in Likoni, in plain words and in our own voice. Do not copy the article; name the source and link it.',
    item.source_url ? `Source: ${item.source_url}` : '',
  ].filter(Boolean).join('\n\n');
  const angle = item.region === 'local' ? 'actionable' : 'analytical';
  await asAdmin(async (q) => {
    const idea = (await q(`insert into social_ideas (title, angle, material, consent_ok, author_id) values ($1,$2,$3,true,$4) returning id`, [`[News] ${String(item.title).slice(0, 140)}`, angle, material.slice(0, 4000), me.id]))[0];
    await q('update news_items set social_idea_id=$2 where id=$1', [id, idea.id]);
  });
  await audit(me.id, 'news item sent to social ideas', 'social_ideas');
  revalidatePath(P); revalidatePath('/portal/social');
  go('Added to the social ideas bank. The founders will draft and approve it like any other idea.', 'ok', region);
}

export async function toggleNewsletterPick(f: FormData) {
  const me = await requireFeature('news', 'edit');
  const id = s(f, 'item', 40), region = s(f, 'region', 20);
  await asAdmin((q) => q('update news_items set newsletter_pick = not newsletter_pick where id=$1', [id]));
  await audit(me.id, 'news newsletter pick toggled', 'news_items');
  revalidatePath(P);
  go('Updated.', 'ok', region);
}
