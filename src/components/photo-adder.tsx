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

export default function PhotoAdder({ id, sw }: { id: string; sw: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function pick(files: FileList | null) {
    if (!files?.length) return; setBusy(true); setErr('');
    for (const f of Array.from(files).slice(0, 4)) {
      const fd = new FormData(); fd.append('file', await shrink(f), 'photo.jpg');
      const r = await fetch(`/api/portal/stories/${id}/photos`, { method: 'POST', body: fd }).catch(() => null);
      if (!r || !r.ok) { setErr((await r?.json().catch(() => null))?.error ?? (sw ? 'Hakuna mtandao.' : 'No connection.')); break; }
    }
    setBusy(false); router.refresh();
  }
  return (
    <div className="mt-4">
      <label className="text-sm font-semibold text-teal">{sw ? 'Ongeza picha' : 'Add photos'}
        <input type="file" accept="image/*" multiple disabled={busy} onChange={(e) => pick(e.target.files)} className="mt-1 block w-full text-sm" /></label>
      {busy && <p className="text-xs text-slate-500">{sw ? 'Inapakia...' : 'Uploading...'}</p>}
      {err && <p role="alert" className="text-xs font-semibold text-red-700">{err}</p>}
    </div>
  );
}
