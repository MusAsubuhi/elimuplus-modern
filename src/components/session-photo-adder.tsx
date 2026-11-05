'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise<Blob>((r) => c.toBlob((b) => r(b ?? file), 'image/jpeg', 0.8));
}

export default function SessionPhotoAdder({ cohortId, days, isFounder }: { cohortId: string; days: { n: number; left: number }[]; isFounder: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const [behind, setBehind] = useState(false); const [day, setDay] = useState(String(days[0]?.n ?? ''));
  async function pick(files: FileList | null) {
    if (!files?.[0]) return;
    setErr(''); setMsg('');
    if (!behind) { setErr('Please tick the box first: the photo must be taken from behind or at a distance.'); return; }
    setBusy(true);
    const fd = new FormData(); fd.append('file', await shrink(files[0]), 'photo.jpg'); fd.append('day', day); fd.append('behind', 'on');
    const r = await fetch(`/api/portal/cohorts/${cohortId}/session-photos`, { method: 'POST', body: fd }).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (!r || !r.ok) setErr(j?.error ?? 'No connection.');
    else { setMsg(j.pending ? 'Added. A founder will check it before the partner sees it.' : 'Added and visible to the partner.'); router.refresh(); }
    setBusy(false);
  }
  if (!days.length) return <p className="text-sm text-slate-600">Every day already has five photos. Remove one to add another.</p>;
  return (
    <div className="space-y-3 text-sm">
      <label className="flex items-start gap-2"><input type="checkbox" checked={behind} onChange={(e) => setBehind(e.target.checked)} className="mt-1" />
        <span><b>Taken from behind or at a distance.</b> No face can be recognised. We do not have written consent from participants.</span></label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="font-bold">Day<select value={day} onChange={(e) => setDay(e.target.value)} className="mt-1 block rounded-lg border border-teal-100 bg-white px-3 py-2 font-normal">{days.map((x) => <option key={x.n} value={x.n}>Day {x.n} ({x.left} left)</option>)}</select></label>
        <label className="font-bold">Photo<input type="file" accept="image/*" capture="environment" disabled={busy} onChange={(e) => { pick(e.target.files); e.target.value = ''; }} className="mt-1 block text-sm font-normal" /></label>
      </div>
      {busy && <p className="text-xs text-slate-500">Uploading...</p>}
      {msg && <p className="text-xs font-semibold text-emerald-700">{msg}</p>}
      {err && <p role="alert" className="text-xs font-semibold text-red-700">{err}</p>}
      {!isFounder && <p className="text-xs text-slate-500">Up to five photos for each training day. A founder checks each one before the partner sees it.</p>}
    </div>
  );
}
