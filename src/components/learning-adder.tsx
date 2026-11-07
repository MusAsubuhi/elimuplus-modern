'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { addResource, prepareLearningUpload } from '../../app/portal/learn-actions';

const inputCls = 'w-full rounded-lg border border-teal-100 bg-white px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal';

/** Founders add a PDF or a link in real time. The PDF goes straight from the browser to private storage, so large files are fine. */
export default function LearningAdder({ topics, audiences }: { topics: Record<string, string>; audiences: Record<string, string> }) {
  const form = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<'pdf' | 'link' | 'video'>('pdf');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const sp = useSearchParams().toString();
  // the page reloads with a message after each add: clear the form so the next item starts fresh
  useEffect(() => { setBusy(false); form.current?.reset(); }, [sp]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setMsg('');
    if (kind === 'pdf') {
      const file = f.get('file');
      if (!(file instanceof File) || !file.size) { setMsg('Choose a PDF file first.'); return; }
      setBusy(true);
      try {
        const prep = await prepareLearningUpload(file.name, file.size);
        if (!prep.ok) { setMsg(prep.error); setBusy(false); return; }
        if (prep.mode === 'local') {
          const up = new FormData(); up.set('file', file); up.set('path', prep.path);
          const r = await fetch('/portal/learn/local-upload', { method: 'POST', body: up });
          if (!r.ok) { setMsg((await r.text()) || 'The upload failed.'); setBusy(false); return; }
        } else {
          const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
          const { error } = await sb.storage.from('learning').uploadToSignedUrl(prep.path, prep.token!, file, { contentType: 'application/pdf' });
          if (error) { setMsg(`The upload failed: ${error.message}`); setBusy(false); return; }
        }
        f.delete('file'); f.set('storage_path', prep.path); f.set('file_name', file.name); f.set('size_bytes', String(file.size));
      } catch { setMsg('The upload failed. Please check your connection and try again.'); setBusy(false); return; }
    }
    f.set('kind', kind);
    setBusy(true);
    await addResource(f); // redirects back to the library with a message
  }

  return (
    <form ref={form} onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2 flex gap-2 text-sm">
        {([['pdf', 'A PDF'], ['link', 'A web link'], ['video', 'A video link']] as const).map(([k, l]) => (
          <button type="button" key={k} onClick={() => setKind(k)} className={`rounded-lg border px-3 py-1.5 font-bold ${kind === k ? 'border-teal bg-teal text-white' : 'border-teal-100 bg-white text-teal'}`}>{l}</button>
        ))}
      </div>
      <label className="sm:col-span-2 text-xs font-bold text-slate-600">Title<input name="title" required maxLength={140} className={inputCls} placeholder="e.g. Running a follow-up visit" /></label>
      {kind === 'pdf'
        ? <label className="sm:col-span-2 text-xs font-bold text-slate-600">PDF file (up to 50 MB)<input type="file" name="file" accept="application/pdf,.pdf" className={inputCls} /></label>
        : <label className="sm:col-span-2 text-xs font-bold text-slate-600">{kind === 'video' ? 'Video link (YouTube or Vimeo play inside the portal)' : 'Link'}<input name="url" type="url" required className={inputCls} placeholder="https://" /></label>}
      <label className="sm:col-span-2 text-xs font-bold text-slate-600">What it is and why it matters (optional)<textarea name="description" rows={2} className={inputCls} /></label>
      <label className="text-xs font-bold text-slate-600">Topic
        <select name="topic" className={inputCls} defaultValue="general">{Object.entries(topics).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="text-xs font-bold text-slate-600">Finish by (optional, for required items)<input type="date" name="due_on" className={inputCls} /></label>
      <fieldset className="sm:col-span-2 text-sm">
        <legend className="text-xs font-bold text-slate-600">Who is it for? (founders always see everything)</legend>
        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
          {Object.entries(audiences).map(([k, v]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" name="audience" value={k} defaultChecked={k === 'facilitator' || k === 'master'} />{v}</label>)}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="required" /> <span><b>Required</b>: people in these groups are expected to finish it</span></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="status" value="draft" /> <span>Save as a draft (only founders can see it)</span></label>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button disabled={busy} className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50">{busy ? 'Uploading…' : 'Add to the library'}</button>
        {msg && <span className="text-sm font-semibold text-red-700">{msg}</span>}
      </div>
    </form>
  );
}
