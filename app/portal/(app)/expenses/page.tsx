import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { Badge, Card, PageHeader, Stat, Table, statusTone, submitCls } from '@/components/ui';
import { BarCard, PieCard } from '@/components/charts';
import { d, kes } from '@/lib/format';
import { PAID_FROM } from '@/lib/expense-labels';
import { signReceipts } from '@/lib/receipts';
import { reconcileExpense } from '../../actions';

export default async function Expenses({ searchParams }: { searchParams: Promise<{ from?: string; status?: string }> }) {
  const me = await requireMe('founder');
  await audit(me.id, 'view expenses ledger', 'expense_requests');
  const { from = '', status = '' } = await searchParams;
  const { rows, receipts } = await asUser(me.id, async (q) => ({
    rows: await q(`select r.*, p.display_name who, c.name cohort, k.name category from expense_requests r join people p on p.id=r.requester_id
      left join cohorts c on c.id=r.cohort_id left join expense_categories k on k.id=r.category_id order by coalesce(r.spent_on, r.created_at::date) desc, r.created_at desc`),
    receipts: await q('select request_id, storage_path, kind from expense_receipts order by created_at').catch(() => []),
  }));
  const signed = await signReceipts(receipts.map((x: any) => x.storage_path));
  const amt = (r: any) => r.paid_amount_kes ?? r.amount_kes;
  const spent = rows.filter((r) => ['paid', 'reconciled'].includes(r.status));
  const total = spent.reduce((s, r) => s + amt(r), 0);
  const owed = rows.filter((r) => r.status === 'approved').reduce((s, r) => s + r.amount_kes, 0);
  const waiting = rows.filter((r) => ['submitted', 'queried'].includes(r.status));
  const noReceipt = spent.filter((r) => r.status !== 'reconciled' && !receipts.some((x: any) => x.request_id === r.id));
  const sum = (key: (r: any) => string) => Object.entries(spent.reduce((m: Record<string, number>, r) => ({ ...m, [key(r)]: (m[key(r)] ?? 0) + amt(r) }), {})).map(([name, value]) => ({ name, value: value as number })).sort((a, b) => b.value - a.value);
  const shown = rows.filter((r) => (!from || r.paid_from === from) && (!status || r.status === status));
  const chip = (label: string, qs: string, on: boolean) => <Link key={label} href={`/portal/expenses${qs}`} className={`rounded-full border px-3 py-1 text-xs font-bold ${on ? 'border-teal bg-teal text-white' : 'border-teal-100 text-teal'}`}>{label}</Link>;
  return (
    <>
      <PageHeader image="/images/hero-bg.jpg" title="Expenses ledger" subtitle="Every cost recorded for Elimu+: who spent it, where the money came from, the receipt, and whether it has been checked against the books.">
        <Link href="/portal/expenses/csv" className="rounded-lg bg-gold px-3 py-1 text-xs font-bold text-teal">Download CSV</Link>
      </PageHeader>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Spent and confirmed" value={kes(total)} tone="green" sub={`${spent.length} records`} />
        <Stat label="Owed to people" value={kes(owed)} tone="gold" sub="approved, not yet paid out" />
        <Stat label="Waiting for confirmation" value={waiting.length} sub={kes(waiting.reduce((s, r) => s + r.amount_kes, 0))} />
        <Stat label="Paid but no receipt" value={noReceipt.length} tone={noReceipt.length ? 'red' : 'teal'} sub="ask for the receipt" />
      </div>
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card title="Where the money came from"><PieCard data={sum((r) => PAID_FROM[r.paid_from] ?? r.paid_from)} money height={220} /></Card>
        <Card title="By category" className="lg:col-span-2"><BarCard data={sum((r) => r.category ?? 'Other').map((x) => ({ cat: x.name, amount: x.value }))} x="cat" height={220} bars={[{ key: 'amount', label: 'KES', color: '#0D3B3B' }]} /></Card>
      </div>
      <Card title="By cohort or running costs" className="mb-4">
        <Table head={['Belongs to', 'Spent', 'Records']} rows={sum((r) => r.cohort ?? 'Running costs (no cohort)').map((x) => [<b key="n">{x.name}</b>, kes(x.value), spent.filter((r) => (r.cohort ?? 'Running costs (no cohort)') === x.name).length])} empty="Nothing spent yet." />
      </Card>
      <Card title="All records" subtitle="Reconcile a record once you have matched it to the bank, M-Pesa or cash book and seen the receipt.">
        <div className="mb-3 flex flex-wrap gap-2">
          {chip('All', '', !from && !status)}
          {Object.entries(PAID_FROM).map(([k, v]) => chip(v, `?from=${k}`, from === k))}
          {chip('Needs reconciling', '?status=paid', status === 'paid')}
        </div>
        <Table head={['Date', 'Who', 'For', 'Paid from', 'Amount', 'Receipt', 'Status', '']} rows={shown.map((r) => {
          const mine = receipts.filter((x: any) => x.request_id === r.id);
          return [d(r.spent_on ?? r.created_at), r.who,
            <div key="f"><b>{r.reason}</b><div className="text-xs text-slate-500">{r.category ?? 'Other'} · {r.cohort ?? 'Running costs'}{r.late ? ' · late' : ''}{r.reference ? ` · ${r.reference}` : ''}</div></div>,
            PAID_FROM[r.paid_from] ?? r.paid_from, kes(amt(r)),
            mine.length ? <div key="rc">{mine.map((m: any, i: number) => <a key={i} href={signed[m.storage_path]} target="_blank" rel="noreferrer" className="block text-xs font-bold text-teal underline">{m.kind === 'pdf' ? 'PDF' : 'Photo'} {i + 1}</a>)}</div> : <span key="rc" className="text-xs text-slate-400">none</span>,
            <Badge key="s" tone={statusTone(r.status)}>{r.status}</Badge>,
            r.status === 'paid' ? <form key="a" action={reconcileExpense}><input type="hidden" name="request" value={r.id} /><button className={submitCls}>Reconcile</button></form> : (r.reconciled_on ? <span key="a" className="text-xs text-slate-500">{d(r.reconciled_on)}</span> : '')];
        })} empty="No records match." />
      </Card>
    </>
  );
}
