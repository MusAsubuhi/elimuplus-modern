'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

async function shrink(file: File): Promise<Blob> {
  if (file.type === 'application/pdf') return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise<Blob>((r) => c.toBlob((b) => r(b ?? file), 'image/jpeg', 0.82));
}

export default function ReceiptAdder({ id, label = 'Add receipt' }: { id: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function pick(files: FileList | null) {
    if (!files?.[0]) return; setBusy(true); setErr('');
    const fd = new FormData(); fd.append('file', await shrink(files[0]), files[0].type === 'application/pdf' ? 'receipt.pdf' : 'receipt.jpg');
    const r = await fetch(`/api/portal/expenses/${id}/receipt`, { method: 'POST', body: fd }).catch(() => null);
    if (!r || !r.ok) setErr((await r?.json().catch(() => null))?.error ?? 'No connection.'); else router.refresh();
    setBusy(false);
  }
  return (
    <label className="block text-xs font-bold text-teal">{label}
      <input type="file" accept="image/*,application/pdf" disabled={busy} onChange={(e) => { pick(e.target.files); e.target.value = ''; }} className="mt-1 block w-full text-xs font-normal" />
      {busy && <span className="font-normal text-slate-500">Uploading...</span>}
      {err && <span role="alert" className="block font-semibold text-red-700">{err}</span>}
    </label>
  );
}
