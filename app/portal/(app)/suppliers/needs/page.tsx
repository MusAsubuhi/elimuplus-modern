import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, inputCls, submitCls } from '@/components/ui';
import { kes, d } from '@/lib/format';
import { addQuote, approveQuote, closeNeed, raiseNeed, recommendQuote } from '../../../supplier-actions';

const tone = (s: string) => (s === 'selected' ? 'green' : s === 'recommended' ? 'gold' : s === 'closed' ? 'grey' : 'teal');
const has = (arr: string[], v: string | null) => !v || arr.some((a) => a.toLowerCase() === v.toLowerCase());

export default async function Needs() {
  const me = await requireMe('facilitator', 'founder');
  const founder = me.roles.includes('founder');
  const D = await asUser(me.id, async (q) => ({
    needs: await q(`select n.*, p.display_name raiser, c.name cohort_name from sourcing_needs n join people p on p.id=n.raised_by left join cohorts c on c.id=n.cohort_id order by (n.status in ('open','recommended')) desc, n.created_at desc limit 40`),
    quotes: await q(`select sq.*, s.name supplier_name, s.phone from sourcing_quotes sq join suppliers s on s.id=sq.supplier_id order by sq.amount_kes nulls last`),
    sups: await q(`select s.id, s.name, s.categories, s.regions,
      (select round(avg((v.price+v.quality+v.reliability)/3.0),1) from supplier_reviews v where v.supplier_id=s.id) rating,
      (select count(*)::int from expense_requests r where r.supplier_id=s.id and r.status in ('approved','paid','reconciled')) jobs
      from suppliers s where s.status='active' order by s.name`),
    cohorts: await q("select id, name from cohorts where status in ('confirmed','delivering','followup') order by seq"),
  }));
  const cats = [...new Set(D.sups.flatMap((x: any) => x.categories as string[]))].sort();
  const regs = [...new Set(D.sups.flatMap((x: any) => x.regions as string[]))].sort();
  return (
    <>
      <PageHeader title="Choosing a supplier" subtitle="Say what we need, compare the suppliers with their quotes, and recommend one. A founder approves the choice and the reason is kept on the supplier’s record." />
      <p className="mb-4 text-sm"><Link href="/portal/suppliers" className="font-bold text-teal underline">← All suppliers</Link></p>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="We need something" className="lg:col-span-1">
          <form action={raiseNeed} className="space-y-2 text-sm">
            <label className="block font-bold">What do you need?<input name="title" required className={inputCls} placeholder="Venue for Cohort 4, day 1 to 5" /></label>
            <label className="block font-bold">Category<input name="category" list="cats" className={inputCls} placeholder="Venue" /></label>
            <label className="block font-bold">Region or town<input name="region" list="regs" className={inputCls} placeholder="Mombasa" /></label>
            <label className="block font-bold">Cohort<select name="cohort" className={inputCls}><option value="">None</option>{D.cohorts.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="block font-bold">Budget (KES)<input name="budget" type="number" min="0" className={inputCls} /></label>
            <label className="block font-bold">Details<textarea name="details" rows={3} className={inputCls} /></label>
            <button className={submitCls}>Start comparing</button>
          </form>
        </Card>
        <div className="space-y-4 lg:col-span-2">
          {D.needs.length === 0 && <Card><p className="text-sm text-slate-600">Nothing yet. When we need a venue, printing, catering or anything else, start here so the choice and the reason are on record.</p></Card>}
          {D.needs.map((n: any) => {
            const qs = D.quotes.filter((x: any) => x.need_id === n.id);
            const open = n.status === 'open' || n.status === 'recommended';
            const mine = n.raised_by === me.id;
            const suggested = D.sups.filter((x: any) => has(x.categories, n.category) && (x.regions.length === 0 || has(x.regions, n.region)) && !qs.some((z: any) => z.supplier_id === x.id));
            return (
              <Card key={n.id} className="scroll-mt-20">
                <div id={`n-${n.id}`} className="flex flex-wrap items-start justify-between gap-2">
                  <div><h3 className="text-lg font-bold text-teal">{n.title}</h3>
                    <p className="text-sm text-slate-600">{[n.category, n.region, n.cohort_name, n.budget_kes ? `budget ${kes(n.budget_kes)}` : null].filter(Boolean).join(' · ')} · {n.raiser} · {d(n.created_at)}</p>
                    {n.details && <p className="mt-1 text-sm">{n.details}</p>}</div>
                  <Badge tone={tone(n.status)}>{n.status}</Badge>
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  {qs.length === 0 && <p className="text-slate-500">No suppliers added yet.</p>}
                  {qs.map((z: any) => (
                    <div key={z.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-mist px-3 py-2">
                      <span><Link href={`/portal/suppliers/${z.supplier_id}`} className="font-bold text-teal underline">{z.supplier_name}</Link>{z.notes ? <span className="text-xs text-slate-600"> · {z.notes}</span> : null}</span>
                      <span className="flex items-center gap-2"><b>{z.amount_kes != null ? kes(z.amount_kes) : 'no quote yet'}</b>
                        {n.recommended_quote_id === z.id && <Badge tone="gold">recommended</Badge>}{n.selected_quote_id === z.id && <Badge tone="green">approved</Badge>}</span>
                    </div>))}
                </div>
                {n.recommended_reason && <p className="mt-2 text-xs text-slate-600"><b>Reason for the recommendation:</b> {n.recommended_reason}</p>}
                {n.selected_reason && <p className="mt-1 text-xs text-slate-600"><b>Why it was chosen:</b> {n.selected_reason}</p>}
                {open && (mine || founder) && (
                  <form action={addQuote} className="mt-3 grid gap-2 border-t border-teal-50 pt-3 text-sm sm:grid-cols-[1.4fr_1fr_1.4fr_auto]"><input type="hidden" name="need" value={n.id} />
                    <select name="supplier" required className={inputCls}><option value="">Add a supplier…</option>
                      {[...suggested, ...D.sups.filter((x: any) => !suggested.includes(x) && !qs.some((z: any) => z.supplier_id === x.id))].map((x: any) => <option key={x.id} value={x.id}>{x.name}{suggested.includes(x) ? ` (fits${x.rating ? `, ${x.rating}/5` : ''}${x.jobs ? `, used ${x.jobs}×` : ''})` : ''}</option>)}</select>
                    <input name="amount" type="number" min="0" placeholder="Quote KES" className={inputCls} />
                    <input name="notes" placeholder="Terms, distance, anything useful" className={inputCls} />
                    <button className={submitCls}>Add</button>
                  </form>)}
                {open && qs.length > 0 && mine && !founder && (
                  <form action={recommendQuote} className="mt-3 grid gap-2 text-sm sm:grid-cols-[1fr_2fr_auto]"><input type="hidden" name="need" value={n.id} />
                    <select name="quote" required defaultValue={n.recommended_quote_id ?? ''} className={inputCls}><option value="">I recommend…</option>{qs.map((z: any) => <option key={z.id} value={z.id}>{z.supplier_name}</option>)}</select>
                    <input name="reason" required defaultValue={n.recommended_reason ?? ''} placeholder="Why this one?" className={inputCls} />
                    <button className={submitCls}>Send for approval</button>
                  </form>)}
                {open && qs.length > 0 && founder && (
                  <form action={approveQuote} className="mt-3 grid gap-2 text-sm sm:grid-cols-[1fr_2fr_auto]"><input type="hidden" name="need" value={n.id} />
                    <select name="quote" required defaultValue={n.recommended_quote_id ?? ''} className={inputCls}><option value="">Approve…</option>{qs.map((z: any) => <option key={z.id} value={z.id}>{z.supplier_name}</option>)}</select>
                    <input name="reason" required defaultValue={n.recommended_reason ?? ''} placeholder="Reason for the choice (kept on record)" className={inputCls} />
                    <button className={submitCls}>Approve</button>
                  </form>)}
                {n.status !== 'closed' && (mine || founder) && <form action={closeNeed} className="mt-2"><input type="hidden" name="need" value={n.id} /><button className="text-xs font-bold text-teal underline">Close this need</button></form>}
              </Card>);
          })}
        </div>
      </div>
      <datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="regs">{regs.map((c) => <option key={c} value={c} />)}</datalist>
    </>
  );
}
