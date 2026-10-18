import { tokenOk } from '@/lib/newsletter';
import { confirmUnsubscribe } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Unsubscribe | Elimu+' };

export default async function Page({ searchParams }: { searchParams: Promise<{ e?: string; t?: string; done?: string; bad?: string }> }) {
  const { e = '', t = '', done, bad } = await searchParams;
  const valid = !!e && tokenOk(e, t);
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <p className="text-sm font-bold uppercase tracking-wide text-gold">Elimu+</p>
      <h1 className="mt-1 text-2xl font-bold text-teal">Unsubscribe</h1>
      {done ? (
        <p className="mt-4 text-slate-700">You have been unsubscribed and will not receive further newsletters from us. If this was a mistake, you can subscribe again at elimuplus.com.</p>
      ) : bad || !valid ? (
        <p className="mt-4 text-slate-700">This unsubscribe link is not valid. Please email hello@elimuplus.com and we will remove you by hand.</p>
      ) : (
        <form action={confirmUnsubscribe} className="mt-4 space-y-4">
          <p className="text-slate-700">Stop sending Elimu+ newsletters to <b>{e}</b>?</p>
          <input type="hidden" name="e" value={e} />
          <input type="hidden" name="t" value={t} />
          <button className="rounded bg-teal px-5 py-2.5 font-bold text-white">Yes, unsubscribe me</button>
        </form>
      )}
    </main>
  );
}
