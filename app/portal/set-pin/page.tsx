import { redirect } from 'next/navigation';
import { getMe } from '@/lib/session';
import { SetPinForm } from '@/components/pin-forms';

export const metadata = { title: 'Choose your PIN · Elimu+' };

export default async function SetPin() {
  const me = await getMe();
  if (!me) redirect('/portal/login');
  if (!me.mustChangePin) redirect('/portal');
  return (
    <div className="min-h-screen bg-mist">
      <div className="bg-teal px-6 py-10 text-white">
        <div className="mx-auto max-w-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-elimu-white.png" alt="Elimu+" className="mb-4 h-10 w-auto" />
          <h1 className="text-2xl font-black">Karibu, {me.displayName}</h1>
          <p className="mt-1 text-sm text-teal-100">Before you start, choose a PIN that only you know. The one you were given was temporary.</p>
        </div>
      </div>
      <div className="mx-auto max-w-md px-6 py-8">
        <div className="rounded-xl border border-teal-100 bg-white p-6 shadow-sm"><SetPinForm /></div>
        <p className="mt-3 text-xs text-slate-500">Do not share your PIN, not even with Elimu+ staff. If you forget it, a founder can give you a new temporary one.</p>
      </div>
    </div>
  );
}
