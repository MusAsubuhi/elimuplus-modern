import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { releaseDueQuotes } from '@/lib/billing';
import { Badge, Card, PageHeader, Stat, Table, inputCls, statusTone, submitCls } from '@/components/ui';
import { notifyPayment } from '../../../partner-actions';
import { BANK } from '@/lib/pricing';
import { BarCard } from '@/components/charts';
import { d, kes } from '@/lib/format';

export default async function Billing() {
  const me = await requireMe('org_admin');
  await releaseDueQuotes().catch(() => {});
  const { invoices, payments, quotes, notices, receipts } = await asUser(me.id, async (q) => ({
    invoices: await q(`select i.*, o.name org_name, coalesce((select sum(amount_kes) from payments p where p.invoice_id=i.id),0)::int paid from invoices i join organisations o on o.id=i.organisation_id order by i.issued_on desc`),
    payments: await q('select p.*, i.number from payments p join invoices i on i.id=p.invoice_id order by p.received_on desc'),
    notices: await q(`select n.*, i.number from payment_notices n join invoices i on i.id=n.invoice_id order by n.created_at desc`),
    receipts: await q(`select r.*, p.amount_kes, i.number inv from receipts r join payments p on p.id=r.payment_id join invoices i on i.id=p.invoice_id order by r.issued_on desc`),
    quotes: await q(`select qt.*, (select coalesce(sum(qty*unit_kes),0)::int from quote_lines l where l.quote_id=qt.id) total,
        (select coalesce(sum(qty*unit_kes) filter (where kind like 'followup%'),0)::int from quote_lines l where l.quote_id=qt.id) followups
        from quotes qt where qt.status <> 'draft' order by issued_on desc`),
  }));
  const billed = invoices.reduce((s, i) => s + i.amount_kes, 0), paid = invoices.reduce((s, i) => s + i.paid, 0);
  const unpaid = invoices.filter((i) => i.paid < i.amount_kes);
  const tag = (t: string) => t.replace(/[^0-9a-f]/g, '');
  const link = (kind: string, tok: string) => `/d/${kind}/${tag(tok)}`;
  return (
    <>
      <PageHeader image="/images/partner-hero.jpg" title="Invoices and payments" subtitle="What was quoted, what you have been invoiced and what you have paid. Payments are confirmed by us after we receive them." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Invoiced" value={kes(billed)} /><Stat tone="green" label="Paid" value={kes(paid)} /><Stat tone={billed - paid ? 'gold' : 'green'} label="Outstanding" value={kes(billed - paid)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Invoiced vs paid" className="lg:col-span-1"><BarCard data={invoices.map((i) => ({ invoice: i.number, invoiced: i.amount_kes, paid: i.paid }))} x="invoice" money height={240} bars={[{ key: 'invoiced', label: 'Invoiced' }, { key: 'paid', label: 'Paid', color: '#2E8B7A' }]} /></Card>
        <Card title="Invoices" className="lg:col-span-2">
          <Table head={['Invoice', 'For', 'Due', 'Amount', 'Paid', 'Status', '']} rows={invoices.map((i) => [<b key="n">{i.number}</b>, i.kind === 'followup' ? 'Follow-up visits' : i.kind === 'training' ? 'Training' : 'Other', d(i.due_on), kes(i.amount_kes), kes(i.paid), <Badge key="s" tone={statusTone(i.status)}>{i.status}</Badge>, <a key="l" className="text-xs font-bold text-teal underline" href={link('invoice', i.share_token)} target="_blank">Open or print</a>])} />
          <p className="mt-3 text-xs text-slate-500">Pay by bank transfer to {BANK.bank}, account {BANK.number} ({BANK.name}), using the invoice number as the reference. Online M-Pesa payment will be added later.</p>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="I have paid" subtitle="Tell us once you have paid by M-Pesa or the bank. We check it and send your receipt.">
          {unpaid.length ? (
            <form action={notifyPayment} className="grid gap-2 text-sm">
              <select name="invoice" className={inputCls}>{unpaid.map((i) => <option key={i.id} value={i.id}>{i.number} · {kes(i.amount_kes - i.paid)} outstanding</option>)}</select>
              <div className="grid grid-cols-2 gap-2">
                <input name="amount" type="number" min="1" required placeholder="Amount paid (KES)" className={inputCls} />
                <select name="method" className={inputCls}><option value="mpesa">M-Pesa</option><option value="bank">Bank transfer</option><option value="cash">Cash</option></select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input name="reference" required placeholder="M-Pesa code or bank reference" className={inputCls} />
                <input name="paid_on" type="date" className={inputCls} aria-label="Date paid" />
              </div>
              <input name="note" placeholder="Anything we should know (optional)" className={inputCls} />
              <button className={submitCls}>Send payment details</button>
            </form>
          ) : <p className="text-sm text-slate-500">Nothing is outstanding.</p>}
          {notices.length > 0 && <div className="mt-4"><Table head={['Sent', 'Invoice', 'Amount', 'Reference', 'Status']} rows={notices.map((n) => [d(n.created_at), n.number, kes(n.amount_kes), n.reference ?? '', <Badge key="s" tone={n.status === 'confirmed' ? 'green' : n.status === 'rejected' ? 'red' : 'gold'}>{n.status === 'pending' ? 'checking' : n.status}</Badge>])} /></div>}
          {notices.some((n) => n.status === 'rejected') && <p className="mt-2 text-xs text-red-700">{notices.filter((n) => n.status === 'rejected').map((n) => `${n.reference}: ${n.review_note ?? 'we could not match this payment, please check the reference'}`).join(' · ')}</p>}
        </Card>
        <Card title="Receipts"><Table head={['Receipt', 'Invoice', 'Amount', 'Date', '']} rows={receipts.map((r) => [<b key="n">{r.number}</b>, r.inv, kes(r.amount_kes), d(r.issued_on), <a key="l" className="text-xs font-bold text-teal underline" href={link('receipt', r.share_token)} target="_blank">Open or print</a>])} empty="Receipts appear here once we confirm a payment." /></Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Quotes"><Table head={['Quote', 'Issued', 'Total', 'of which follow-up visits', 'Status', '']} rows={quotes.map((x) => [x.number ?? '', d(x.issued_on), kes(x.total), kes(x.followups), <Badge key="s" tone={statusTone(x.status)}>{x.status}</Badge>, <span key="l" className="whitespace-nowrap text-xs font-bold"><a className="text-teal underline" href={link('proposal', x.share_token)} target="_blank">Proposal</a> · <a className="text-teal underline" href={link('quote', x.share_token)} target="_blank">Quotation</a></span>])} /></Card>
        <Card title="Payments received"><Table head={['Date', 'Invoice', 'Amount', 'Method', 'Reference']} rows={payments.map((p) => [d(p.received_on), p.number, kes(p.amount_kes), p.method, p.reference ?? ''])} /></Card>
      </div>
    </>
  );
}
