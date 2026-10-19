import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, Table, inputCls, statusTone, submitCls } from '@/components/ui';
import { BarCard, PieCard } from '@/components/charts';
import { d, kes, pct } from '@/lib/format';
import { audit } from '@/lib/audit';
import { recordPayment } from '../../actions';

export default async function Finance() {
  const me = await requireMe('founder');
  await audit(me.id, 'view finance', 'finance');
  const F = await asUser(me.id, async (q) => ({
    invoices: await q(`select i.*, o.name org_name, coalesce((select sum(amount_kes) from payments p where p.invoice_id=i.id),0)::int paid from invoices i join organisations o on o.id=i.organisation_id order by i.issued_on desc`),
    payments: await q('select p.*, i.number, o.name org_name from payments p join invoices i on i.id=p.invoice_id join organisations o on o.id=i.organisation_id order by p.received_on desc'),
    cohortMargin: await q(`select c.name,
        coalesce((select sum(p.amount_kes) from payments p join invoices i on i.id=p.invoice_id join quotes qt on qt.id=i.quote_id where qt.cohort_id=c.id),0)::int income,
        (coalesce((select sum(coalesce(r.paid_amount_kes,r.amount_kes)) from expense_requests r where r.cohort_id=c.id and r.status in ('paid','reconciled')),0)
         + coalesce((select sum(amount_kes) from trainer_payments t where t.cohort_id=c.id),0))::int cost
        from cohorts c order by c.seq`),
    lines: await q(`select l.kind, sum(l.qty*l.unit_kes)::int total from quote_lines l join quotes qt on qt.id=l.quote_id group by l.kind order by 2 desc`),
    trainerPay: await q(`select t.*, p.display_name, c.name cohort from trainer_payments t join people p on p.id=t.person_id left join cohorts c on c.id=t.cohort_id order by t.paid_on desc`),
    support: await q(`select s.*, p.display_name from support_ledger s join enrolments e on e.id=s.enrolment_id join people p on p.id=e.person_id order by s.entry_date desc`),
    settings: await q(`select key, value from settings where key in ('cohort1_support_total_kes','expense_threshold_kes')`),
  }));
  const billed = F.invoices.reduce((s, i) => s + i.amount_kes, 0), paid = F.invoices.reduce((s, i) => s + i.paid, 0);
  const cohort1 = Number(F.settings.find((s) => s.key === 'cohort1_support_total_kes')?.value ?? 0);
  const thr = Number(F.settings.find((s) => s.key === 'expense_threshold_kes')?.value ?? 0);
  const open = F.invoices.filter((i) => i.paid < i.amount_kes);
  return (
    <>
      <PageHeader image="/images/hero-bg.jpg" title="Finance" subtitle="Quoted, invoiced, received and spent, by partner and by cohort. This platform records money; it does not hold or move it." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Invoiced" value={kes(billed)} /><Stat tone="green" label="Received" value={kes(paid)} /><Stat tone="gold" label="Outstanding" value={kes(billed - paid)} />
        <Stat tone="red" label="Approval threshold" value={kes(thr)} sub="above this both founders approve" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Margin by cohort" subtitle="Cash received against costs paid" className="lg:col-span-2"><BarCard data={F.cohortMargin.map((c) => ({ cohort: c.name.replace(/ \(.*\)/, ''), income: c.income, cost: c.cost }))} x="cohort" money height={260} bars={[{ key: 'income', label: 'Received', color: '#0D3B3B' }, { key: 'cost', label: 'Costs', color: '#C8553D' }]} /></Card>
        <Card title="Quoted, by line type" subtitle="Training and follow-up visits are separate lines"><PieCard data={F.lines.map((l) => ({ name: l.kind.replace('_', ' '), value: l.total }))} money height={260} /></Card>
      </div>
      <Card title="Invoices" className="mt-4">
        <Table head={['Invoice', 'Partner', 'Issued', 'Due', 'Amount', 'Paid', 'Balance', 'Status']} rows={F.invoices.map((i) => [<b key="n">{i.number}</b>, i.org_name, d(i.issued_on), d(i.due_on), kes(i.amount_kes), kes(i.paid), kes(i.amount_kes - i.paid), <Badge key="s" tone={statusTone(i.status)}>{i.status}</Badge>])} />
        {open.length > 0 && (
          <form action={recordPayment} className="mt-4 grid gap-2 rounded-lg bg-mist p-3 text-sm sm:grid-cols-5">
            <select name="invoice" className={inputCls}>{open.map((i) => <option key={i.id} value={i.id}>{i.number} · {kes(i.amount_kes - i.paid)} due</option>)}</select>
            <input name="amount" type="number" min="1" placeholder="Amount received (KES)" required className={inputCls} />
            <select name="method" className={inputCls}><option value="mpesa">M-Pesa</option><option value="bank">Bank</option><option value="cash">Cash</option></select>
            <input name="reference" placeholder="M-Pesa code / reference" className={inputCls} />
            <button className={submitCls}>Record payment</button>
          </form>
        )}
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Payments received"><Table head={['Date', 'Partner', 'Invoice', 'Amount', 'Reference']} rows={F.payments.map((p) => [d(p.received_on), p.org_name, p.number, kes(p.amount_kes), p.reference ?? ''])} /></Card>
        <Card title="Trainer fees and stipends"><Table head={['Date', 'Who', 'Kind', 'Cohort', 'Amount']} rows={F.trainerPay.map((t) => [d(t.paid_on), t.display_name, t.kind, t.cohort ?? '', kes(t.amount_kes)])} /></Card>
      </div>
      <Card title="Support given to participants" subtitle="Kept apart from fees and costs. Visible to founders only." className="mt-4">
        <div className="mb-3 grid gap-3 sm:grid-cols-2"><Stat label="Cohort 1 support total (confirmed)" value={kes(cohort1)} tone="gold" /><Stat label="Entries in this demo ledger" value={kes(F.support.reduce((s, x) => s + x.amount_kes, 0))} sub="demo entries only" /></div>
        <Table head={['Date', 'Participant', 'Item', 'Amount', 'Funder']} rows={F.support.map((s) => [d(s.entry_date), s.display_name, s.item, kes(s.amount_kes), s.funder ?? ''])} />
      </Card>
    </>
  );
}
