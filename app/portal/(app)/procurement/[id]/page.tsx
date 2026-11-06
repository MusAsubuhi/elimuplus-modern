import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asAdmin } from '@/lib/db';
import { requireFeature, featureLevel } from '@/lib/access';
import { Badge, Card, PageHeader, Stat, Table, inputCls, submitCls } from '@/components/ui';
import PrintButton from '@/components/print-button';
import { d, kes } from '@/lib/format';
import { linkExpenseToPO, poStep, receiveLines, recordPOPayment } from '../../../biz-actions';

export default async function PO({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireFeature('procurement');
  const canEdit = (await featureLevel(me, 'procurement')) === 'edit';
  const X = await asAdmin(async (q) => {
    const p = (await q(`select p.*, p.ordered_on::text oo, p.expected_on::text eo, s.name supplier, s.phone sphone, c.name cohort from purchase_orders p left join suppliers s on s.id=p.supplier_id left join cohorts c on c.id=p.cohort_id where p.id=$1`, [id]))[0];
    if (!p) return null;
    return { p,
      exps: await q(`select id, amount_kes, status, paid_from, spent_on::text so, reference from expense_requests where po_id=$1 order by created_at`, [id]),
      unlinked: await q(`select id, amount_kes, reason, spent_on::text so from expense_requests where po_id is null and status <> 'declined' order by created_at desc limit 25`),
      cats: await q('select id, name from expense_categories order by name'),
      lines: await q('select id, description, qty::float8 qty, unit_price::float8 price, received_qty::float8 recv, item_id from po_lines where po_id=$1 order by description', [id]) };
  });
  if (!X) notFound();
  const { p, lines, exps } = X; const billed = exps.filter((e: any) => e.status !== 'declined').reduce((a: number, e: any) => a + e.amount_kes, 0);
  const recvValue = lines.reduce((a: number, l: any) => a + l.recv * l.price, 0); const inp = 'w-full rounded-lg border border-teal-100 bg-white px-3 py-2 text-sm'; const total = lines.reduce((a: number, l: any) => a + l.qty * l.price, 0);
  const canRecv = ['approved', 'sent', 'partly_received'].includes(p.status);
  const act = (a: string, label: string, cls = submitCls) => <form action={poStep}><input type="hidden" name="id" value={id} /><input type="hidden" name="act" value={a} /><button className={cls}>{label}</button></form>;
  return (
    <>
      {!canEdit && <div className="mb-4 rounded-xl border border-gold bg-gold-100 p-3 text-sm font-bold text-teal">You can look at this page but not change it. Ask a founder if you need to edit.</div>}
      <fieldset disabled={!canEdit} className="contents">
      <PageHeader image="/images/hero-bg.jpg" title={p.po_no} subtitle={`${p.supplier ?? 'Supplier not chosen'} · ${p.cohort ?? p.purpose ?? 'General'} · ordered ${d(p.oo)}${p.eo ? ` · expected ${d(p.eo)}` : ''}`}>
        <Badge tone={p.status === 'received' ? 'green' : 'gold'}>{p.status.replace('_', ' ')}</Badge><Link href="/portal/procurement" className="rounded-lg bg-white/15 px-3 py-1 text-xs font-bold">All orders</Link>
      </PageHeader>
      <div className="mb-4 grid gap-4 sm:grid-cols-3"><Stat label="Order value" value={kes(total)} /><Stat tone="green" label="Received so far" value={kes(lines.reduce((a: number, l: any) => a + l.recv * l.price, 0))} /><Stat tone="gold" label="Billed or paid so far" value={kes(billed)} sub={billed > total + 1 ? 'more than the order value' : `${kes(Math.max(0, total - billed))} left to pay`} /></div>
      <Card title="Lines" subtitle={canRecv ? 'Enter what arrived. Items linked to stock are added to inventory.' : undefined}>
        <form action={receiveLines}><input type="hidden" name="id" value={id} />
          <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-1">Item</th><th>Ordered</th><th>Unit price</th><th>Line total</th><th>Received</th>{canRecv && <th>Received now</th>}</tr></thead>
            <tbody>{lines.map((l: any) => <tr key={l.id} className="border-t border-teal-100"><td className="py-1.5">{l.description}{l.item_id ? <span className="ml-1 text-xs text-slate-400">(stock)</span> : ''}</td><td>{l.qty}</td><td>{kes(l.price)}</td><td>{kes(l.qty * l.price)}</td><td>{l.recv}</td>{canRecv && <td><input name={`recv_${l.id}`} inputMode="decimal" className="w-20 rounded border border-teal-100 px-1 py-0.5" /></td>}</tr>)}</tbody></table>
          {canRecv && <button className={`${submitCls} mt-3`}>Record goods received</button>}
        </form>
      </Card>
      <Card title="Payment" subtitle="Each payment or supplier bill is recorded as an expense linked to this order, so what was ordered, received and paid can be compared." className="mt-4">
        {billed > recvValue + 1 && recvValue > 0 && <p className="mb-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">More has been billed or paid ({kes(billed)}) than has been received ({kes(recvValue)}). Check before paying the rest.</p>}
        <Table head={['Expense', 'Amount', 'How', 'Date', 'Reference', 'Status']} rows={exps.map((e: any) => [e.id.slice(0, 8), kes(e.amount_kes), e.paid_from.replace('_', ' '), e.so ? d(e.so) : '', e.reference ?? '', <Badge key="s" tone={['paid', 'reconciled', 'approved'].includes(e.status) ? 'green' : e.status === 'declined' ? 'grey' : 'gold'}>{e.status}</Badge>])} empty="Nothing paid or billed against this order yet." />
        {p.status !== 'cancelled' && (
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <form action={recordPOPayment} className="grid gap-2 sm:grid-cols-2"><input type="hidden" name="id" value={id} />
              <label className="text-xs font-bold text-slate-600">Amount (KES)<input name="amount" inputMode="decimal" defaultValue={Math.max(0, Math.round(total - billed)) || ''} required className={inp} /></label>
              <label className="text-xs font-bold text-slate-600">How it was paid<select name="how" className={inp}><option value="to_be_paid">Not paid yet (supplier bill)</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option><option value="cash">Cash</option><option value="own_pocket">Own pocket (to refund)</option></select></label>
              <label className="text-xs font-bold text-slate-600">Date paid<input type="date" name="spent_on" className={inp} /></label>
              <label className="text-xs font-bold text-slate-600">Reference<input name="reference" placeholder="M-Pesa code, invoice no." className={inp} /></label>
              <label className="text-xs font-bold text-slate-600 sm:col-span-2">Cost category<select name="category" className={inp}><option value="">Other costs</option>{X.cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <div className="sm:col-span-2"><button className={submitCls}>Record payment</button></div>
            </form>
            <form action={linkExpenseToPO} className="space-y-2 self-start"><input type="hidden" name="id" value={id} />
              <label className="text-xs font-bold text-slate-600">Already recorded in Expenses? Link it<select name="expense_id" className={inp}><option value="">Choose an expense</option>{X.unlinked.map((e: any) => <option key={e.id} value={e.id}>{kes(e.amount_kes)} · {e.reason.slice(0, 40)}{e.so ? ` · ${d(e.so)}` : ''}</option>)}</select></label>
              <button className={submitCls}>Link to this order</button>
            </form>
          </div>)}
      </Card>
      <div className="no-print mt-4 flex flex-wrap gap-3">
        {p.status === 'draft' && act('approve', 'Approve')}
        {p.status === 'approved' && act('sent', 'Mark as sent to supplier')}
        {['draft', 'approved', 'sent'].includes(p.status) && act('cancel', 'Cancel order', 'rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-700')}
        <PrintButton label="Print order" />
      </div>
      <p className="mt-3 text-xs text-slate-500">A purchase order alone is not a cost in the accounts. The payments you record above go to the Expenses ledger, and once a founder confirms them they count in the profit and loss.</p>
      </fieldset>
    </>
  );
}
