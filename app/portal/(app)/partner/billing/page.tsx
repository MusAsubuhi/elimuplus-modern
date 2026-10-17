import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, Table, statusTone } from '@/components/ui';
import { BarCard } from '@/components/charts';
import { d, kes } from '@/lib/format';

export default async function Billing() {
  const me = await requireMe('org_admin');
  const { invoices, payments, quotes } = await asUser(me.id, async (q) => ({
    invoices: await q(`select i.*, o.name org_name, coalesce((select sum(amount_kes) from payments p where p.invoice_id=i.id),0)::int paid from invoices i join organisations o on o.id=i.organisation_id order by i.issued_on desc`),
    payments: await q('select p.*, i.number from payments p join invoices i on i.id=p.invoice_id order by p.received_on desc'),
    quotes: await q(`select qt.*, (select coalesce(sum(qty*unit_kes),0)::int from quote_lines l where l.quote_id=qt.id) total,
        (select coalesce(sum(qty*unit_kes) filter (where kind like 'followup%'),0)::int from quote_lines l where l.quote_id=qt.id) followups
        from quotes qt order by issued_on desc`),
  }));
  const billed = invoices.reduce((s, i) => s + i.amount_kes, 0), paid = invoices.reduce((s, i) => s + i.paid, 0);
  return (
    <>
      <PageHeader image="/images/partner-hero.jpg" title="Invoices and payments" subtitle="What was quoted, what you have been invoiced and what you have paid. Payments are confirmed by us after we receive them." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Invoiced" value={kes(billed)} /><Stat tone="green" label="Paid" value={kes(paid)} /><Stat tone={billed - paid ? 'gold' : 'green'} label="Outstanding" value={kes(billed - paid)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Invoiced vs paid" className="lg:col-span-1"><BarCard data={invoices.map((i) => ({ invoice: i.number, invoiced: i.amount_kes, paid: i.paid }))} x="invoice" money height={240} bars={[{ key: 'invoiced', label: 'Invoiced' }, { key: 'paid', label: 'Paid', color: '#2E8B7A' }]} /></Card>
        <Card title="Invoices" className="lg:col-span-2">
          <Table head={['Invoice', 'Issued', 'Due', 'Amount', 'Paid', 'Status']} rows={invoices.map((i) => [<b key="n">{i.number}</b>, d(i.issued_on), d(i.due_on), kes(i.amount_kes), kes(i.paid), <Badge key="s" tone={statusTone(i.status)}>{i.status}</Badge>])} />
          <p className="mt-3 text-xs text-slate-500">To pay: M-Pesa Paybill or bank transfer using the invoice number as reference. Online payment will be added later.</p>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Quotes"><Table head={['Issued', 'Total', 'of which follow-up visits', 'Status']} rows={quotes.map((x) => [d(x.issued_on), kes(x.total), kes(x.followups), <Badge key="s" tone={statusTone(x.status)}>{x.status}</Badge>])} /></Card>
        <Card title="Payments received"><Table head={['Date', 'Invoice', 'Amount', 'Method', 'Reference']} rows={payments.map((p) => [d(p.received_on), p.number, kes(p.amount_kes), p.method, p.reference ?? ''])} /></Card>
      </div>
    </>
  );
}
