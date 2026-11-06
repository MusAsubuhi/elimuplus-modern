import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, Table, inputCls, statusTone, submitCls } from '@/components/ui';
import { d, kes } from '@/lib/format';
import { PieCard } from '@/components/charts';
import { submitExpense } from '../../actions';
import { PHASES, phaseLabel } from '@/lib/levels';
import { HOW, PAID_FROM } from '@/lib/expense-labels';
import { signReceipts } from '@/lib/receipts';
import ReceiptAdder from '@/components/receipt-adder';

const STAGES = ['submitted', 'approved', 'paid', 'reconciled'];

export default async function Requests({ searchParams }: { searchParams: Promise<{ cohort?: string; purpose?: string }> }) {
  const me = await requireMe('facilitator', 'founder');
  const { cohort: preCohort = '', purpose: prePurpose = '' } = await searchParams;
  const { reqs, cats, cohorts, pay, receipts } = await asUser(me.id, async (q) => ({
    receipts: await q('select request_id, storage_path, kind from expense_receipts order by created_at').catch(() => []),
    reqs: await q(`select r.*, c.name cohort_name, c.status cohort_status, k.name category from expense_requests r left join cohorts c on c.id=r.cohort_id left join expense_categories k on k.id=r.category_id where r.requester_id=$1 order by r.created_at desc`, [me.id]),
    cats: await q('select * from expense_categories order by name'),
    cohorts: await q("select id, name, status, start_date, end_date from cohorts where status in ('confirmed','delivering','followup','closed') order by (status='delivering') desc, seq"),
    pay: await q('select * from trainer_payments where person_id=$1 order by paid_on desc', [me.id]),
  }));
  const signed = await signReceipts(receipts.map((x: any) => x.storage_path));
  const pending = reqs.filter((r) => r.status === 'submitted').reduce((s, r) => s + r.amount_kes, 0);
  const byCat = Object.entries(reqs.reduce((m: Record<string, number>, r) => ({ ...m, [r.category ?? 'Other']: (m[r.category ?? 'Other'] ?? 0) + r.amount_kes }), {})).map(([name, value]) => ({ name, value: value as number }));
  return (
    <>
      <PageHeader image="/images/trainer-coaching.jpg" title="Money for Elimu+" subtitle="Ask for money, or record money you have already spent for Elimu+: your own, or from the Elimu+ bank, M-Pesa or cash. Add the receipt, then a founder confirms it." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Waiting for approval" value={kes(pending)} tone="gold" />
        <Stat label="Paid to me (requests)" value={kes(reqs.filter((r) => r.status === 'paid' || r.status === 'reconciled').reduce((s, r) => s + (r.paid_amount_kes ?? 0), 0))} tone="green" />
        <Stat label="Fees and stipends received" value={kes(pay.reduce((s, p) => s + p.amount_kes, 0))} />
      </div>
      {cohorts.length === 0 && <p className="mb-4 rounded-lg bg-gold-100 p-3 text-sm text-gold-600">There is no confirmed or running cohort yet, so requests for training costs have no cohort to attach to. Use "Something else" for general costs, or ask a founder to confirm the cohort.</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Record or request money" className="lg:col-span-1">
          <form action={submitExpense} className="space-y-3 text-sm">
            <fieldset className="space-y-1"><legend className="font-bold">What is this?</legend>
              {HOW.map((h, i) => (<label key={h.k} className="flex items-start gap-2 rounded-lg border border-teal-100 p-2"><input type="radio" name="how" value={h.k} defaultChecked={i === 0} className="mt-1" /><span><b>{h.label}</b><br /><span className="text-xs text-slate-500">{h.hint}</span></span></label>))}
            </fieldset>
            <label className="block font-bold">Date spent <span className="font-normal text-slate-500">(leave empty for a request)</span><input name="spent_on" type="date" max={new Date().toISOString().slice(0, 10)} className={inputCls} /></label>
            <label className="block font-bold">Which cohort is this for?<select name="cohort" defaultValue={preCohort} className={inputCls}><option value="">No cohort (general cost)</option>{cohorts.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}</select></label>
            <label className="block font-bold">Training, follow-up or something else?<select name="purpose" defaultValue={prePurpose || 'training'} className={inputCls}>{PHASES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="block font-bold">Category<select name="category" className={inputCls}><option value="">Other</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="block font-bold">Amount (KES)<input name="amount" type="number" min="1" required className={inputCls} /></label>
            <label className="block font-bold">What was it for?<textarea name="reason" rows={3} required className={inputCls} /></label>
            <label className="block font-bold">Reference <span className="font-normal text-slate-500">(M-Pesa code, bank reference, receipt number)</span><input name="reference" className={inputCls} /></label>
            <button className={submitCls}>Save</button>
            <p className="text-xs text-slate-500">Above the founders' threshold both founders must confirm. Nobody confirms their own record, so a founder's spending is confirmed by the other founder. Costs after a cohort has closed can be recorded here and are marked late.</p>
          </form>
        </Card>
        <Card title="My requests" className="lg:col-span-2">
          <Table head={['Date', 'For', 'Amount', 'Receipt', 'Status']} rows={reqs.map((r) => {
            const mine = receipts.filter((x: any) => x.request_id === r.id);
            return [
              d(r.spent_on ?? r.created_at),
              <div key="f"><b>{r.reason}</b><div className="text-xs text-slate-500">{r.category ?? 'Other'} · {r.cohort_name ? `${r.cohort_name} · ${phaseLabel(r.purpose)}` : 'General'}{r.late ? ' · late' : ''}</div><div className="text-xs text-slate-500">{PAID_FROM[r.paid_from] ?? ''}{r.reference ? ` · ${r.reference}` : ''}</div></div>,
              kes(r.amount_kes),
              <div key="rc" className="min-w-[8rem] space-y-1">{mine.map((m: any, i: number) => <a key={i} href={signed[m.storage_path]} target="_blank" rel="noreferrer" className="block text-xs font-bold text-teal underline">{m.kind === 'pdf' ? 'PDF receipt' : 'Photo'} {i + 1}</a>)}{r.status !== 'reconciled' && mine.length < 4 && <ReceiptAdder id={r.id} label={mine.length ? 'Add another' : r.paid_from === 'to_be_paid' ? 'Add receipt later' : 'Add receipt (needed)'} />}</div>,
              <div key="s" className="space-y-1"><Badge tone={statusTone(r.status)}>{r.status}</Badge><div className="flex gap-1">{STAGES.map((st, i) => <span key={st} className={`h-1.5 w-5 rounded ${r.status === 'declined' ? 'bg-red-300' : i <= STAGES.indexOf(r.status) ? 'bg-teal' : 'bg-teal-100'}`} title={st} />)}</div></div>,
            ];
          })} empty="Nothing recorded yet." />
        </Card>
      </div>
      {byCat.length > 0 && <Card title="Where my requests go" className="mt-4 max-w-md"><PieCard data={byCat} money height={220} /></Card>}
    </>
  );
}
