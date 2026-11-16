'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function Inner() {
  const sp = useSearchParams();
  const ok = sp.get('ok'), err = sp.get('err');
  const key = `${ok ?? ''}|${err ?? ''}`;
  const [hidden, setHidden] = useState('');
  useEffect(() => {
    if (!ok && !err) return;
    const t = setTimeout(() => setHidden(key), err ? 15000 : 8000);
    return () => clearTimeout(t);
  }, [key, ok, err]);
  if ((!ok && !err) || hidden === key) return null;
  const text = ok === 'saved' ? 'Saved' : ok === 'nochange' ? 'No changes to save' : ok === 'submitted' ? 'Submitted' : ok ?? err;
  // Fixed to the top of the screen so it is seen wherever the page is scrolled to.
  return (
    <div role="status" className={`no-print fixed left-1/2 top-3 z-50 flex w-[min(92vw,640px)] -translate-x-1/2 items-start gap-3 rounded-lg border px-4 py-2.5 text-sm font-semibold shadow-lg ${err ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
      <span className="flex-1">{text}</span>
      <button type="button" onClick={() => setHidden(key)} aria-label="Dismiss" className="font-bold opacity-70 hover:opacity-100">×</button>
    </div>
  );
}
export default function Flash() { return <Suspense><Inner /></Suspense>; }
