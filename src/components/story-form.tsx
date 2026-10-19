'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { inputCls, submitCls } from './ui';

export type Who = { id: string; name: string; cohort: string; minor: boolean; ageKnown: boolean };
type Theme = { k: string; en: string; sw: string };

/** Shrinks a photo in the browser first (phone photos are often 5 MB or more) so it uploads on a weak connection. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.8));
}

export default function StoryForm({ who, themes, photos, lang, own }: { who: Who[]; themes: Theme[]; photos: boolean; lang: 'sw' | 'en'; own: boolean }) {
  const router = useRouter();
  const sw = lang === 'sw';
  const [pick, setPick] = useState(who.length === 1 ? who[0].id : '');
  const [consent, setConsent] = useState('');
  const [photoOk, setPhotoOk] = useState(false);
  const [guardian, setGuardian] = useState(false);
  const [adult, setAdult] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const cur = who.find((w) => w.id === pick);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr('');
    const f = new FormData(e.currentTarget);
    setBusy(sw ? 'Inahifadhi hadithi...' : 'Saving the story...');
    const res = await fetch('/api/portal/stories', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        enrolment_id: pick || undefined, title: f.get('title'), body: f.get('body'), quote: f.get('quote'), language: f.get('language'),
        themes: f.getAll('themes'), consent_story: consent, consent_photo: photoOk, guardian_confirmed: guardian, age_ok: adult,
        guardian_name: f.get('guardian_name'), source: f.get('source') || undefined,
      }),
    }).catch(() => null);
    const j = await res?.json().catch(() => null);
    if (!res || !res.ok || !j?.id) { setBusy(''); setErr(j?.error ?? (sw ? 'Hakuna mtandao. Jaribu tena.' : 'No connection. Please try again.')); return; }
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      setBusy(sw ? `Inapakia picha ${i + 1} kati ya ${files.length}...` : `Uploading photo ${i + 1} of ${files.length}...`);
      const fd = new FormData();
      fd.append('file', await shrink(files[i]), 'photo.jpg');
      const r = await fetch(`/api/portal/stories/${j.id}/photos`, { method: 'POST', body: fd }).catch(() => null);
      if (!r || !r.ok) failed++;
    }
    router.push(`/portal/stories/${j.id}?${failed ? 'err' : 'ok'}=${encodeURIComponent(failed
      ? (sw ? `Hadithi imehifadhiwa, lakini picha ${failed} hazikupakiwa. Zipakie tena kwenye ukurasa huu.` : `Story saved, but ${failed} photo(s) did not upload. You can add them again here.`)
      : (sw ? 'Asante. Hadithi yako imepokelewa.' : 'Thank you. The story has been received.'))}`);
  }

  const L = (en: string, s: string) => (sw ? s : en);
  return (
    <form onSubmit={submit} className="space-y-5">
      {who.length > 1 && (
        <label className="block text-sm font-semibold text-teal">{L('Whose story is it?', 'Hadithi ya nani?')}
          <select value={pick} onChange={(e) => setPick(e.target.value)} required className={`${inputCls} mt-1`}>
            <option value="">{L('Choose a participant', 'Chagua mshiriki')}</option>
            {who.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.cohort})</option>)}
          </select>
        </label>
      )}
      {!own && (
        <label className="block text-sm font-semibold text-teal">{L('How was it collected?', 'Ilikusanywaje?')}
          <select name="source" className={`${inputCls} mt-1`}><option value="trainer">{L('In person or at training', 'Ana kwa ana au kwenye mafunzo')}</option><option value="followup">{L('During a follow-up visit or call', 'Wakati wa ufuatiliaji')}</option></select>
        </label>
      )}
      <label className="block text-sm font-semibold text-teal">{L('Title (optional)', 'Kichwa (si lazima)')}
        <input name="title" maxLength={140} className={`${inputCls} mt-1`} placeholder={L('For example: My first sale', 'Mfano: Mauzo yangu ya kwanza')} />
      </label>
      <label className="block text-sm font-semibold text-teal">{L('The story', 'Hadithi')}
        <textarea name="body" required rows={8} maxLength={6000} className={`${inputCls} mt-1`}
          placeholder={L('What did you do before the training, what did you try afterwards, and what changed? A few honest sentences are enough.', 'Ulikuwa unafanya nini kabla ya mafunzo, ulijaribu nini baadaye, na nini kilibadilika? Sentensi chache za kweli zinatosha.')} />
      </label>
      <label className="block text-sm font-semibold text-teal">{L('One sentence in your own words (optional)', 'Sentensi moja kwa maneno yako (si lazima)')}
        <input name="quote" maxLength={300} className={`${inputCls} mt-1`} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-teal">{L('Language of the story', 'Lugha ya hadithi')}
          <select name="language" defaultValue="sw" className={`${inputCls} mt-1`}><option value="sw">Kiswahili</option><option value="en">English</option><option value="mixed">{L('Mixed', 'Mchanganyiko')}</option></select>
        </label>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold text-teal">{L('What changed? (choose any)', 'Nini kilibadilika? (chagua yoyote)')}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {themes.map((t) => (
            <label key={t.k} className="flex items-center gap-1.5 rounded-full border border-teal-100 bg-white px-3 py-1 text-sm">
              <input type="checkbox" name="themes" value={t.k} /> {sw ? t.sw : t.en}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-3 rounded-xl border-2 border-gold bg-gold-100 p-4">
        <p className="text-sm font-bold text-teal">{L('Permission', 'Ruhusa')}</p>
        <p className="text-xs text-slate-700">{L('Elimu+ may share this story with the partner who funded your training and, with the founders’ approval, on our website and social media. You can take it back at any time and it will be removed.', 'Elimu+ inaweza kushiriki hadithi hii na mshirika aliyefadhili mafunzo yako na, kwa idhini ya waanzilishi, kwenye tovuti na mitandao yetu. Unaweza kuiondoa wakati wowote.')}</p>
        <label className="flex items-start gap-2 text-sm"><input type="radio" name="cs" checked={consent === 'named'} onChange={() => setConsent('named')} required className="mt-1" />
          <span>{L('Use my first name and the first letter of my last name', 'Tumia jina langu la kwanza na herufi ya kwanza ya jina la mwisho')}</span></label>
        <label className="flex items-start gap-2 text-sm"><input type="radio" name="cs" checked={consent === 'anonymous'} onChange={() => setConsent('anonymous')} className="mt-1" />
          <span>{L('Keep me anonymous (no name)', 'Nisitajwe jina')}</span></label>
        {photos && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={photoOk} onChange={(e) => setPhotoOk(e.target.checked)} className="mt-1" />
          <span>{L('I agree to share photos with this story', 'Nakubali picha zitumike na hadithi hii')}</span></label>}
        {cur?.minor && <>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={guardian} onChange={(e) => setGuardian(e.target.checked)} className="mt-1" />
            <span>{L('A parent or guardian has agreed to this', 'Mzazi au mlezi amekubali')}</span></label>
          <input name="guardian_name" maxLength={120} placeholder={L('Name of the parent or guardian', 'Jina la mzazi au mlezi')} className={inputCls} /></>}
        {cur && !cur.minor && !cur.ageKnown && (
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-1" />
            <span>{L('This person is 18 or older', 'Mtu huyu ana umri wa miaka 18 au zaidi')}</span></label>)}
      </div>

      {photos && photoOk && (
        <label className="block text-sm font-semibold text-teal">{L('Photos (up to 4)', 'Picha (hadi 4)')}
          <input type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 4))} className={`${inputCls} mt-1`} />
          <span className="mt-1 block text-xs font-normal text-slate-500">{L('Photos are made smaller on your phone and the location data is removed.', 'Picha zinapunguzwa ukubwa kwenye simu na taarifa za eneo huondolewa.')}</span>
        </label>
      )}
      {err && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{err}</p>}
      <button disabled={!!busy} className={submitCls}>{busy || L('Send the story', 'Tuma hadithi')}</button>
    </form>
  );
}
