import { asAdmin } from '@/lib/db';
import { d } from '@/lib/format';

export const metadata = { title: 'Verify an Elimu+ certificate', robots: { index: false } };

// Public: shows only the number, tier, status and issue date. No personal data.
export default async function Verify({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const row = (await asAdmin((q) => q('select number, tier, status, issued_on from certifications where upper(number)=upper($1)', [decodeURIComponent(number)])))[0];
  const titles: Record<number, string> = { 1: 'Foundation Facilitator', 2: 'Programme Facilitator', 3: 'Senior Facilitator', 4: 'Accredited ToT Lead' };
  return (
    <main className="mx-auto max-w-md p-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <div className="mb-6 rounded-xl bg-[#0D3B3B] p-4"><img src="/images/logo-elimu-white.png" alt="Elimu+" className="h-10" /></div>
      <h1 className="mb-4 text-2xl font-black text-[#0D3B3B]">Certificate check</h1>
      {row ? (
        <div className={`rounded-xl border-2 p-5 ${row.status === 'active' ? 'border-emerald-600 bg-emerald-50' : 'border-amber-500 bg-amber-50'}`}>
          <p className="text-sm font-bold uppercase text-slate-500">Certificate</p>
          <p className="text-xl font-black">{row.number}</p>
          <dl className="mt-3 space-y-1 text-sm">
            <div><dt className="inline font-bold">Level: </dt><dd className="inline">Tier {row.tier}, {titles[row.tier as number]}</dd></div>
            <div><dt className="inline font-bold">Status: </dt><dd className="inline capitalize">{String(row.status).replace('_', ' ')}</dd></div>
            <div><dt className="inline font-bold">Issued: </dt><dd className="inline">{d(row.issued_on)}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-slate-600">Issued by Elimu+. Only Elimu+ can issue or withdraw a certificate.</p>
        </div>
      ) : <div className="rounded-xl border-2 border-red-500 bg-red-50 p-5"><p className="font-bold text-red-700">No certificate found with that number.</p><p className="mt-1 text-sm">Check the number and try again, or contact Elimu+.</p></div>}
    </main>
  );
}
