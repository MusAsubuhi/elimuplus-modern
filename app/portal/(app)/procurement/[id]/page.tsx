import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, inputCls, submitCls } from '@/components/ui';
import PrintButton from '@/components/print-button';
import { d, kes } from '@/lib/format';
import { poStep, receiveLines } from '../../../biz-actions';

export default async function PO({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe('founder');
  const X = await asUser(me.id, async (q) => {
    const p = (await q(`select p.*, p.ordered_on::text oo, p.expected_on::text eo, s.name supplier, s.phone sphone, c.name cohort from purchase_orders p left join suppliers s on s.id=p.supplier_id left join cohorts c on c.id=p.cohort_id where p.id=$1`, [id]))[0];
    if (!p) return null;
    return { p, lines: await q('select id, description, qty::float8 qty, unit_price::float8 price, received_qty::float8 recv, item_id from po_lines where po_id=$1 order by description', [id]) };
  });
  if (!X) notFound();
  const { p, lines } = X; const total = lines.reduce((a: number, l: any) => a + l.qty * l.price, 0);
  const canRecv = ['approved', 'sent', 'partly_received'].includes(p.status);
  const act = (a: string, label: string, cls = submitCls) => <form action={poStep}><input type="hidden" name="id" value={id} /><input type="hidden" name="act" value={a} /><button className={cls}>{label}</button></form>;
  return (
    <>
      <PageHeader image="/images/hero-bg.jpg" title={p.po_no} subtitle={`${p.supplier ?? 'Supplier not chosen'} · ${p.cohort ?? p.purpose ?? 'General'} · ordered ${d(p.oo)}${p.eo ? ` · expected ${d(p.eo)}` : ''}`}>
        <Badge tone={p.status === 'received' ? 'green' : 'gold'}>{p.status.replace('_', ' ')}</Badge><Link href="/portal/procurement" className="rounded-lg bg-white/15 px-3 py-1 text-xs font-bold">All orders</Link>
      </PageHeader>
      <div className="mb-4 grid gap-4 sm:grid-cols-3"><Stat label="Order value" value={kes(total)} /><Stat tone="green" label="Received so far" value={kes(lines.reduce((a: number, l: any) => a + l.recv * l.price, 0))} /><Stat tone="gold" label="Approved by" value={p.approved_at ? d(p.approved_at) : 'Not yet'} /></div>
      <Card title="Lines" subtitle={canRecv ? 'Enter what arrived. Items linked to stock are added to inventory.' : undefined}>
        <form action={receiveLines}><input type="hidden" name="id" value={id} />
          <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-1">Item</th><th>Ordered</th><th>Unit price</th><th>Line total</th><th>Received</th>{canRecv && <th>Received now</th>}</tr></thead>
            <tbody>{lines.map((l: any) => <tr key={l.id} className="border-t border-teal-100"><td className="py-1.5">{l.description}{l.item_id ? <span className="ml-1 text-xs text-slate-400">(stock)</span> : ''}</td><td>{l.qty}</td><td>{kes(l.price)}</td><td>{kes(l.qty * l.price)}</td><td>{l.recv}</td>{canRecv && <td><input name={`recv_${l.id}`} inputMode="decimal" className="w-20 rounded border border-teal-100 px-1 py-0.5" /></td>}</tr>)}</tbody></table>
          {canRecv && <button className={`${submitCls} mt-3`}>Record goods received</button>}
        </form>
      </Card>
      <div className="no-print mt-4 flex flex-wrap gap-3">
        {p.status === 'draft' && act('approve', 'Approve')}
        {p.status === 'approved' && act('sent', 'Mark as sent to supplier')}
        {['draft', 'approved', 'sent'].includes(p.status) && act('cancel', 'Cancel order', 'rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-700')}
        <PrintButton label="Print order" />
      </div>
      <p className="mt-3 text-xs text-slate-500">This tracks what was ordered and what arrived. When you pay the supplier, record the spending in the Expenses ledger so it reaches the accounts; a purchase order alone does not count as a cost.</p>
    </>
  );
}
