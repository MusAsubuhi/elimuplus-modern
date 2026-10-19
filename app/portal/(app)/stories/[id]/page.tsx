import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asUser } from '@/lib/db';
import { getLang, requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, inputCls, statusTone, submitCls } from '@/components/ui';
import { d } from '@/lib/format';
import PhotoAdder from '@/components/photo-adder';
import { MAX_PHOTOS, STATUS_LABEL, introLine, signPhotos, themeLabel } from '@/lib/stories';
import { removeStoryPhoto, reviewStory, storyToSocial, withdrawStory } from '../../../story-actions';

export default async function Story({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe('participant', 'facilitator', 'master', 'founder');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const lang = await getLang(me);
  const x = await asUser(me.id, async (q) => {
    const s = (await q(`select s.*, p.full_name, c.name cohort_name, cb.display_name collector from participant_stories s
        join people p on p.id = s.person_id join cohorts c on c.id = s.cohort_id left join people cb on cb.id = s.collected_by where s.id = $1`, [id]))[0];
    if (!s) return null;
    return { s, photos: await q('select id, storage_path, caption, cover from story_photos where story_id = $1 order by created_at', [id]) };
  });
  if (!x || x.s.status === 'withdrawn') notFound();
  const { s, photos } = x;
  const urls = await signPhotos(photos.map((p: any) => p.storage_path));
  const founder = me.roles.includes('founder');
  const mine = s.person_id === me.id;
  const open = s.status === 'submitted' || s.status === 'declined';
  const sw = lang === 'sw';
  return (
    <>
      <PageHeader title={s.title || (sw ? 'Hadithi' : 'Story')} subtitle={`${s.full_name} · ${s.cohort_name} · ${d(s.created_at)}`}>
        <Badge tone={statusTone(s.status)}>{STATUS_LABEL[s.status] ?? s.status}</Badge>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <p className="whitespace-pre-line text-sm leading-relaxed">{s.body}</p>
          {s.quote && <blockquote className="mt-4 border-l-4 border-gold pl-3 text-sm italic text-teal">“{s.quote}”</blockquote>}
          {!!s.themes?.length && <p className="mt-4 text-xs text-slate-500">{s.themes.map((t: string) => themeLabel(t, lang)).join(' · ')}</p>}
          {photos.length > 0 && (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {photos.map((p: any) => (
                <figure key={p.id} className="space-y-1">
                  {urls[p.storage_path] && /* eslint-disable-next-line @next/next/no-img-element */ <img src={urls[p.storage_path]} alt={p.caption || 'Story photo'} className="aspect-square w-full rounded-lg object-cover" />}
                  {open && (mine || me.roles.some((r) => r === 'facilitator' || r === 'founder')) && (
                    <form action={removeStoryPhoto}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="story" value={id} />
                      <button className="text-xs font-bold text-red-700 underline">{sw ? 'Ondoa' : 'Remove'}</button></form>)}
                </figure>
              ))}
            </div>
          )}
          {open && s.consent_photo && photos.length < MAX_PHOTOS && (
            <PhotoAdder id={id} sw={sw} />
          )}
        </Card>
        <div className="space-y-4">
          <Card title={sw ? 'Ruhusa iliyotolewa' : 'Permission on file'}>
            <ul className="space-y-1 text-sm">
              <li>{s.consent_story === 'named' ? (sw ? 'Jina linaweza kutumika' : 'Name may be used') : (sw ? 'Bila jina' : 'Anonymous')}</li>
              <li>{s.consent_photo ? (sw ? 'Picha zinaruhusiwa' : 'Photos allowed') : (sw ? 'Hakuna picha' : 'No photos')}</li>
              {s.consent_guardian && <li>{sw ? 'Mzazi au mlezi amekubali' : 'Guardian agreed'}</li>}
              <li className="text-xs text-slate-500">{sw ? 'Ilikusanywa na' : 'Collected by'} {s.collector ?? '—'} · {d(s.consent_at)}</li>
              {s.shown_name && <li className="text-xs text-slate-500">{sw ? 'Itaitwa' : 'Introduced as'}: <b>{s.shown_name}</b></li>}
              {s.review_note && <li className="text-xs text-slate-500">{s.review_note}</li>}
            </ul>
          </Card>
          {founder && s.status !== 'declined' && (
            <Card title="Decision">
              {s.status === 'submitted' && (
                <form action={reviewStory} className="space-y-2">
                  <input type="hidden" name="id" value={id} /><input type="hidden" name="act" value="approve" />
                  <label className="block text-xs font-semibold text-teal">Introduce as
                    <input name="shown_name" defaultValue={introLine(s.consent_story, s.full_name, s.cohort_name)} className={`${inputCls} mt-1`} /></label>
                  <input name="note" placeholder="Note (optional)" className={inputCls} />
                  <button className={submitCls}>Approve for partners</button>
                </form>)}
              {(s.status === 'approved' || s.status === 'published') && (
                <div className="space-y-2">
                  {s.status === 'approved' && <form action={reviewStory}><input type="hidden" name="id" value={id} /><input type="hidden" name="act" value="publish" /><button className={submitCls}>Mark as published</button></form>}
                  <form action={storyToSocial}><input type="hidden" name="id" value={id} /><button className="rounded-lg border border-teal px-4 py-2 text-sm font-bold text-teal">{s.social_idea_id ? 'On the social board' : 'Send to Social ideas'}</button></form>
                </div>)}
              {s.status !== 'published' && (
                <form action={reviewStory} className="mt-3 space-y-2 border-t border-teal-100 pt-3">
                  <input type="hidden" name="id" value={id} /><input type="hidden" name="act" value="decline" />
                  <input name="note" required placeholder="Why it will not be used" className={inputCls} />
                  <button className="text-sm font-bold text-red-700 underline">Do not use this story</button>
                </form>)}
            </Card>
          )}
          {(mine || founder || me.roles.includes('facilitator')) && (
            <Card title={sw ? 'Ondoa hadithi' : 'Take it back'}>
              <p className="mb-2 text-xs text-slate-600">{sw ? 'Hadithi na picha zote zitaondolewa.' : 'The story and all its photos will be removed.'}</p>
              <form action={withdrawStory}><input type="hidden" name="id" value={id} /><button className="text-sm font-bold text-red-700 underline">{sw ? 'Ondoa hadithi hii' : 'Withdraw this story'}</button></form>
            </Card>)}
          <Link href="/portal/stories" className="block text-sm font-bold text-teal underline">← {sw ? 'Hadithi zote' : 'All stories'}</Link>
        </div>
      </div>
    </>
  );
}
