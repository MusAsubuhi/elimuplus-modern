import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, Table, inputCls, submitCls } from '@/components/ui';
import { d, kes } from '@/lib/format';
import { todayEAT } from '@/lib/ops';
import { createPO } from '../../biz-actions';

const lbl = 'block text-xs font-bold text-slate-600';
export default async function Procurement() {
  const me = await requireMe('founder');
  const today = todayEAT();
  const X = await asUser(me.id, async (q) => ({
    pos: await q(`select p.id, p.po_no, p.status, p.purpose, p.ordered_on::text oo, p.expected_on::text eo, s.name supplier, c.name cohort,
        coalesce((select sum(qty*unit_price) from po_lines l where l.po_id=p.id),0)::float8 total,
        coalesce((select sum(received_qty*unit_price) from po_lines l where l.po_id=p.id),0)::float8 received
        from purchase_orders p left join suppliers s on s.id=p.supplier_id left join cohorts c on c.id=p.cohort_id order by p.created_at desc`),
    suppliers: await q(`select id, name from suppliers where status in ('active','suggested') order by name`),
    cohorts: await q(`select c.id, c.name from cohorts c join organisations o on o.id=c.organisation_id where not o.is_internal order by c.seq desc limit 30`),
    items: await q(`select id, name, unit from inventory_items where active order by name`),
  }));
  const live = X.pos.filter((p: any) => ['approved', 'sent', 'partly_received'].includes(p.status));
  return (
    <>
      <PageHeader image="/images/hero-bg.jpg" title="Procurement" subtitle="Purchase orders to suppliers: draft, approve, send, receive. Received stock goes straight into the inventory. Payment is still recorded in the Expenses ledger.">
        <Link href="/portal/suppliers" className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-teal">Suppliers and needs</Link>
      </PageHeader>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Stat label="Awaiting approval" value={X.pos.filter((p: any) => p.status === 'draft').length} />
        <Stat tone="gold" label="Ordered, not yet received" value={kes(live.reduce((a: number, p: any) => a + (p.total - p.received), 0))} sub={`${live.length} order${live.length === 1 ? '' : 's'}`} />
        <Stat tone="red" label="Late deliveries" value={live.filter((p: any) => p.eo && p.eo < today).length} />
      </div>
      <div className="space-y-5">
        <Card title="Purchase orders">
          <Table head={['No.', 'Supplier', 'For', 'Ordered', 'Expected', 'Value', 'Received', 'Status']}
            rows={X.pos.map((p: any) => [<Link key="n" href={`/portal/procurement/${p.id}`} className="font-bold text-teal underline">{p.po_no}</Link>, p.supplier ?? 'Not chosen', p.cohort ?? p.purpose ?? 'General', d(p.oo), p.eo ? d(p.eo) : '', kes(p.total), kes(p.received),
              <Badge key="s" tone={p.status === 'received' ? 'green' : p.status === 'cancelled' ? 'grey' : p.status === 'draft' ? 'blue' : 'gold'}>{p.status.replace('_', ' ')}</Badge>])} empty="No purchase orders yet." />
        </Card>
        <Card title="New purchase order" subtitle="Up to six lines. Pick a stock item to have it added to stock when received, or just type a description.">
          <form action={createPO} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <label className={lbl}>Supplier<select name="supplier_id" className={inputCls}><option value="">Not chosen yet</option>{X.suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label className={lbl}>For cohort<select name="cohort_id" className={inputCls}><option value="">General</option>{X.cohorts.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className={lbl}>Expected by<input type="date" name="expected_on" className={inputCls} /></label>
              <label className={lbl}>Purpose<input name="purpose" className={inputCls} /></label>
            </div>
            <div className="grid grid-cols-12 gap-2 text-xs font-bold text-slate-500"><div className="col-span-3">Stock item (optional)</div><div className="col-span-4">Description</div><div className="col-span-2">Quantity</div><div className="col-span-3">Unit price (KES)</div></div>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <select name={`item_${i}`} className={`${inputCls} col-span-3`}><option value="">Other</option>{X.items.map((it: any) => <option key={it.id} value={it.id}>{it.name}</option>)}</select>
                <input name={`desc_${i}`} className={`${inputCls} col-span-4`} /><input name={`qty_${i}`} inputMode="decimal" className={`${inputCls} col-span-2`} /><input name={`price_${i}`} inputMode="decimal" className={`${inputCls} col-span-3`} />
              </div>))}
            <button className={submitCls}>Draft purchase order</button>
          </form>
        </Card>
      </div>
    </>
  );
}
