'use client';
import { useState } from 'react';

type Item = { id: string; description: string; amount: number; sub: string };

/** The payment form: tick the claims to settle, see the running total, then record the payment. */
export default function PayForm({ person, items, action, defaultMethod, hasMpesa, today, locked }: {
  person: string; items: Item[]; action: (f: FormData) => void | Promise<void>; defaultMethod: string; hasMpesa: boolean; today: string; locked?: string;
}) {
  const [on, setOn] = useState<Set<string>>(new Set(items.map((i) => i.id)));
  const [method, setMethod] = useState(defaultMethod);
  const total = items.filter((i) => on.has(i.id)).reduce((s, i) => s + i.amount, 0);
  const toggle = (id: string) => setOn((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const cls = 'w-full rounded-lg border border-teal-100 bg-white px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal';
  const needRef = method !== 'cash';
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="person" value={person} />
      <fieldset>
        <legend className="mb-2 text-sm font-bold text-teal">Work being paid for</legend>
        <ul className="divide-y divide-teal-100 rounded-lg border border-teal-100">
          {items.map((i) => (
            <li key={i.id}>
              <label className="flex cursor-pointer items-start gap-3 p-3 hover:bg-teal-50/50">
                <input type="checkbox" name="claim" value={i.id} checked={on.has(i.id)} onChange={() => toggle(i.id)} className="mt-1" />
                <span className="flex-1 text-sm"><b>{i.description}</b><br /><span className="text-xs text-slate-500">{i.sub}</span></span>
                <span className="text-sm font-bold text-ink">KES {i.amount.toLocaleString('en-KE')}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="flex items-center justify-between rounded-xl bg-teal px-5 py-4 text-white">
        <span className="text-sm font-semibold uppercase tracking-wide text-teal-100">Total to pay</span>
        <span className="text-3xl font-bold">KES {total.toLocaleString('en-KE')}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm font-semibold">How you paid
          <select name="method" value={method} onChange={(e) => setMethod(e.target.value)} className={`${cls} mt-1 font-normal`}>
            <option value="mpesa" disabled={!hasMpesa}>M-Pesa{hasMpesa ? '' : ' (no number on file)'}</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cash">Cash</option>
          </select></label>
        <label className="text-sm font-semibold">{method === 'mpesa' ? 'M-Pesa code' : method === 'bank_transfer' ? 'Bank reference' : 'Receipt note (optional)'}
          <input name="reference" required={needRef} placeholder={method === 'mpesa' ? 'For example QHX1ABC234' : ''} className={`${cls} mt-1 font-normal uppercase`} /></label>
        <label className="text-sm font-semibold">Date paid
          <input type="date" name="paid_on" defaultValue={today} max={today} className={`${cls} mt-1 font-normal`} /></label>
      </div>
      <button disabled={!total || !!locked} className="w-full rounded-lg bg-gold px-5 py-3 text-base font-bold text-teal hover:bg-gold-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
        Record payment of KES {total.toLocaleString('en-KE')}
      </button>
      {locked && <p className="text-sm font-semibold text-[#C8553D]">{locked}</p>}
    </form>
  );
}
