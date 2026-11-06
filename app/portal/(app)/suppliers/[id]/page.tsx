import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, Table, inputCls, submitCls } from '@/components/ui';
import { kes, d } from '@/lib/format';
import { reviewSupplier, setSupplierStatus, updateSupplier } from '../../../supplier-actions';

export default async function Supplier({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe('facilitator', 'founder');
  const { id } = await params;
  const founder = me.roles.includes('founder');
  const D = await asUser(me.id, async (q) => ({
    s: (await q('select * from suppliers where id=$1', [id]))[0],
    used: await q(`select r.amount_kes, r.paid_amount_kes, r.reason, r.status, coalesce(r.spent_on, r.created_at::date) on_date, c.name cohort, p.display_name who
      from expense_requests r left join cohorts c on c.id=r.cohort_id join people p on p.id=r.requester_id where r.supplier_id=$1 order by on_date desc`, [id]),
    reviews: await q('select v.*, p.display_name who, c.name cohort from supplier_reviews v join people p on p.id=v.reviewer_id left join cohorts c on c.id=v.cohort_id where v.supplier_id=$1 order by v.created_at desc', [id]),
    cohorts: await q("select id, name from cohorts where status in ('confirmed','delivering','followup','closed') order by seq"),
    needs: await q(`select n.title, n.status, n.created_at, n.selected_reason, (n.selected_quote_id = sq.id) won from sourcing_quotes sq join sourcing_needs n on n.id=sq.need_id where sq.supplier_id=$1 order by n.created_at desc`, [id]),
  }));
  if (!D.s) notFound();
  const s = D.s as any;
  const spent = D.used.filter((u: any) => ['approved', 'paid', 'reconciled'].includes(u.status)).reduce((t: number, u: any) => t + (u.paid_amount_kes ?? u.amount_kes), 0);
  const avg = (k: string) => (D.reviews.length ? (D.reviews.reduce((t: number, v: any) => t + v[k], 0) / D.reviews.length).toFixed(1) : '–');
  const sel = (name: string) => <select name={name} defaultValue="4" className={inputCls}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}</select>;
  return (
    <>
      <PageHeader title={s.name} subtitle={`${s.categories.join(', ')} · ${s.regions.length ? s.regions.join(', ') : 'serves any region'}`} />
      <p className="mb-4 text-sm"><Link href="/portal/suppliers" className="font-bold text-teal underline">← All suppliers</Link></p>
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Status" value={s.status.replace('_', ' ')} tone={s.status === 'active' ? 'green' : 'gold'} />
        <Stat label="Spent with them" value={kes(spent)} />
        <Stat label="Jobs" value={D.used.length} />
        <Stat label="Price · quality · reliability" value={`${avg('price')} · ${avg('quality')} · ${avg('reliability')}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Contact and notes" className="lg:col-span-1">
          {founder ? (
            <form action={updateSupplier} className="space-y-2 text-sm"><input type="hidden" name="supplier" value={s.id} />
              <label className="block font-bold">Categories<input name="categories" defaultValue={s.categories.join(', ')} className={inputCls} /></label>
              <label className="block font-bold">Regions<input name="regions" defaultValue={s.regions.join(', ')} className={inputCls} /></label>
              <label className="block font-bold">Contact person<input name="contact_name" defaultValue={s.contact_name ?? ''} className={inputCls} /></label>
              <label className="block font-bold">Phone<input name="phone" defaultValue={s.phone ?? ''} className={inputCls} /></label>
              <label className="block font-bold">Email<input name="email" defaultValue={s.email ?? ''} className={inputCls} /></label>
              <label className="block font-bold">What they offer<textarea name="offers" rows={2} defaultValue={s.offers ?? ''} className={inputCls} /></label>
              <label className="block font-bold">Notes<textarea name="notes" rows={3} defaultValue={s.notes ?? ''} className={inputCls} /></label>
              <button className={submitCls}>Save</button>
            </form>
          ) : (
            <ul className="space-y-1 text-sm"><li>{s.contact_name ?? 'No contact person recorded'}</li><li>{s.phone ?? ''}</li><li>{s.email ?? ''}</li>{s.offers && <li className="pt-2">{s.offers}</li>}{s.notes && <li className="pt-2 text-slate-600">{s.notes}</li>}</ul>
          )}
          {founder && (
            <form action={setSupplierStatus} className="mt-4 flex flex-wrap gap-2 border-t border-teal-50 pt-3"><input type="hidden" name="supplier" value={s.id} /><input type="hidden" name="back" value={`/portal/suppliers/${s.id}`} />
              {['active', 'on_hold', 'blocked'].filter((x) => x !== s.status).map((x) => <button key={x} name="status" value={x} className="rounded-lg border border-teal-100 px-3 py-1.5 text-xs font-bold text-teal">{x === 'active' ? 'Approve / reactivate' : x === 'on_hold' ? 'Put on hold' : 'Block'}</button>)}
            </form>
          )}
        </Card>
        <Card title="History" className="lg:col-span-2">
          <Table head={['Date', 'For', 'Amount', 'Cohort']} empty="Not used yet. Pick this supplier on the money form and it will appear here." rows={D.used.map((u: any) => [d(u.on_date), <span key="r">{u.reason}<div className="text-xs text-slate-500">{u.who} · {u.status}</div></span>, kes(u.paid_amount_kes ?? u.amount_kes), u.cohort ?? 'General'])} />
          {D.needs.length > 0 && <div className="mt-3 text-xs text-slate-600"><b>Considered for:</b> {D.needs.map((n: any) => `${n.title}${n.won ? ' (chosen)' : ''}`).join(' · ')}</div>}
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Reviews" className="lg:col-span-2">
          <Table head={['Who', 'Price', 'Quality', 'Reliability', 'Note']} empty="No reviews yet." rows={D.reviews.map((v: any) => [<span key="w">{v.who}<div className="text-xs text-slate-500">{d(v.created_at)}{v.cohort ? ` · ${v.cohort}` : ''}</div></span>, v.price, v.quality, v.reliability, v.note ?? ''])} />
        </Card>
        {s.status === 'active' && (
          <Card title="Rate this supplier" subtitle="After you have used them. Be fair; it helps the next team.">
            <form action={reviewSupplier} className="space-y-2 text-sm"><input type="hidden" name="supplier" value={s.id} />
              <div className="grid grid-cols-3 gap-2"><label className="font-bold">Price{sel('price')}</label><label className="font-bold">Quality{sel('quality')}</label><label className="font-bold">Reliability{sel('reliability')}</label></div>
              <p className="text-xs text-slate-500">5 is excellent, 1 is poor.</p>
              <label className="block font-bold">Cohort <span className="font-normal text-slate-500">(optional)</span><select name="cohort" className={inputCls}><option value="">None</option>{D.cohorts.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="block font-bold">What happened?<textarea name="note" rows={3} className={inputCls} /></label>
              <button className={submitCls}>Save review</button>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
