'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function Inner() {
  const sp = useSearchParams();
  const ok = sp.get('ok'), err = sp.get('err');
  if (!ok && !err) return null;
  const text = ok === 'saved' ? 'Saved' : ok === 'nochange' ? 'No changes to save' : ok === 'submitted' ? 'Submitted' : ok ?? err;
  return (
    <div role="status" className={`no-print mb-4 rounded-lg border px-4 py-2.5 text-sm font-semibold ${err ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
      {text}
    </div>
  );
}
export default function Flash() { return <Suspense><Inner /></Suspense>; }
