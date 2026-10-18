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
  const me = await requireFeature('news');
  const item = s(f, 'item', 40), note = s(f, 'note', 600), region = s(f, 'region', 20);
  if (!item || !note) go('Write what you want to follow up.', 'err', region);
  await asAdmin((q) => q('insert into news_followups (item_id, person_id, note) values ($1,$2,$3)', [item, me.id, note]));
  await audit(me.id, 'news follow-up added', 'news_followups');
  revalidatePath(P);
  go('Follow-up saved.', 'ok', region);
}

export async function finishFollowup(f: FormData) {
  const me = await requireFeature('news');
  await asAdmin((q) => q(`update news_followups set status='done', done_at=now() where id=$1`, [s(f, 'id', 40)]));
  await audit(me.id, 'news follow-up done', 'news_followups');
  revalidatePath(P);
  go('Marked done.', 'ok', s(f, 'region', 20));
}

export async function hideNews(f: FormData) {
  const me = await requireFeature('news');
  await asAdmin((q) => q('update news_items set hidden=true where id=$1', [s(f, 'item', 40)]));
  await audit(me.id, 'news item hidden', 'news_items');
  revalidatePath(P);
  go('Hidden.', 'ok', s(f, 'region', 20));
}
