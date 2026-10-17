import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, Table, inputCls, statusTone, submitCls } from '@/components/ui';
import { d, kes } from '@/lib/format';
import { PieCard } from '@/components/charts';
import { submitExpense } from '../../actions';
import { PHASES, phaseLabel } from '@/lib/levels';

const STAGES = ['submitted', 'approved', 'paid', 'reconciled'];

export default async function Requests({ searchParams }: { searchParams: Promise<{ cohort?: string; purpose?: string }> }) {
  const me = await requireMe('facilitator', 'founder');
  const { cohort: preCohort = '', purpose: prePurpose = '' } = await searchParams;
  const { reqs, cats, cohorts, pay } = await asUser(me.id, async (q) => ({
    reqs: await q(`select r.*, c.name cohort_name, c.status cohort_status, k.name category from expense_requests r left join cohorts c on c.id=r.cohort_id left join expense_categories k on k.id=r.category_id where r.requester_id=$1 order by r.created_at desc`, [me.id]),
    cats: await q('select * from expense_categories order by name'),
    cohorts: await q("select id, name, status, start_date, end_date from cohorts where status in ('confirmed','delivering','followup') order by (status='delivering') desc, start_date desc"),
    pay: await q('select * from trainer_payments where person_id=$1 order by paid_on desc', [me.id]),
  }));
  const pending = reqs.filter((r) => r.status === 'submitted').reduce((s, r) => s + r.amount_kes, 0);
  const byCat = Object.entries(reqs.reduce((m: Record<string, number>, r) => ({ ...m, [r.category ?? 'Other']: (m[r.category ?? 'Other'] ?? 0) + r.amount_kes }), {})).map(([name, value]) => ({ name, value: value as number }));
  return (
    <>
      <PageHeader image="/images/trainer-coaching.jpg" title="My requests" subtitle="Ask for transport, printing or other costs. A founder approves; you attach the receipt note after payment." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Waiting for approval" value={kes(pending)} tone="gold" />
        <Stat label="Paid to me (requests)" value={kes(reqs.filter((r) => r.status === 'paid' || r.status === 'reconciled').reduce((s, r) => s + (r.paid_amount_kes ?? 0), 0))} tone="green" />
        <Stat label="Fees and stipends received" value={kes(pay.reduce((s, p) => s + p.amount_kes, 0))} />
      </div>
      {cohorts.length === 0 && <p className="mb-4 rounded-lg bg-gold-100 p-3 text-sm text-gold-600">There is no confirmed or running cohort yet, so requests for training costs have no cohort to attach to. Use "Something else" for general costs, or ask a founder to confirm the cohort.</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="New request" className="lg:col-span-1">
          <form action={submitExpense} className="space-y-3 text-sm">
            <label className="block font-bold">Which cohort is this for?<select name="cohort" defaultValue={preCohort} className={inputCls}><option value="">No cohort (general cost)</option>{cohorts.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.status === 'delivering' ? 'running now' : c.status === 'followup' ? 'in follow-up' : 'confirmed'})</option>)}</select></label>
            <label className="block font-bold">Is it for the training or a follow-up?<select name="purpose" defaultValue={prePurpose || (cohorts.some((c) => c.status === 'followup') && !cohorts.some((c) => c.status === 'delivering') ? 'followup_30' : 'training')} className={inputCls}>{PHASES.map(([v, l]) => <option key={v} value={v}>{v === 'other' ? 'Something else, no cohort' : l}</option>)}</select></label>
            <label className="block font-bold">Category<select name="category" className={inputCls}><option value="">Other</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="block font-bold">Amount (KES)<input name="amount" type="number" min="1" required className={inputCls} /></label>
            <label className="block font-bold">Why is it needed?<textarea name="reason" rows={3} required className={inputCls} /></label>
            <button className={submitCls}>Submit request</button>
            <p className="text-xs text-slate-500">Requests above the founders' threshold need both founders. Nobody approves their own request.</p>
          </form>
        </Card>
        <Card title="My requests" className="lg:col-span-2">
          <Table head={['Date', 'For', 'Amount', 'Progress', 'Status']} rows={reqs.map((r) => [
            d(r.created_at),
            <div key="f"><b>{r.reason}</b><div className="text-xs text-slate-500">{r.category ?? 'Other'} · {r.cohort_name ? `${r.cohort_name} · ${phaseLabel(r.purpose)}` : 'General'}</div></div>,
            kes(r.amount_kes),
            <div key="p" className="flex gap-1">{STAGES.map((s, i) => <span key={s} className={`h-2 w-8 rounded ${r.status === 'declined' ? 'bg-red-300' : i <= STAGES.indexOf(r.status) ? 'bg-teal' : 'bg-teal-100'}`} title={s} />)}</div>,
            <Badge key="s" tone={statusTone(r.status)}>{r.status}</Badge>])} empty="No requests yet." />
        </Card>
      </div>
      {byCat.length > 0 && <Card title="Where my requests go" className="mt-4 max-w-md"><PieCard data={byCat} money height={220} /></Card>}
    </>
  );
}
