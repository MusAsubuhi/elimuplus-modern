'use client';
import { useState } from 'react';
import { submitCls } from '@/components/ui';

/** A message the founder can read, copy and send by hand (WhatsApp, SMS or their own email). */
export function CopyBox({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <p className="mb-1 text-xs font-bold text-slate-600">{label}</p>
      <pre className="whitespace-pre-wrap font-sans text-slate-800">{text}</pre>
      <button type="button" className={`${submitCls} mt-2`} onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* ignore */ } }}>{copied ? 'Copied' : 'Copy message'}</button>
    </div>
  );
}
