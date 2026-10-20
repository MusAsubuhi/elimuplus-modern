import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { CLAIM_LABEL, CLAIM_STEPS, METHOD_LABEL } from '@/lib/payouts';
import { Badge, Card, PageHeader, Stat, Table, inputCls, statusTone, submitCls } from '@/components/ui';
import { BarCard } from '@/components/charts';
import { d, kes } from '@/lib/format';
import { saveMethod } from '../../payout-actions';

const sum = (rows: Record<string, any>[]) => rows.reduce((a, r) => a + Number(r.amount_kes), 0);

export default async function Earnings() {
  const me = await requireMe('facilitator', 'founder');
  const { claims, payouts, legacy, method } = await asUser(me.id, async (q) => ({
    claims: await q(`select c.*, co.name cohort from payout_claims c left join cohorts co on co.id=c.cohort_id where c.person_id=$1 order by c.created_at desc`, [me.id]),
    payouts: await q('select * from payouts where person_id=$1 order by paid_on desc, created_at desc', [me.id]),
    legacy: await q('select t.*, c.name cohort from trainer_payments t left join cohorts c on c.id=t.cohort_id where t.person_id=$1 order by t.paid_on desc', [me.id]),
    method: (await q('select * from payout_methods where person_id=$1', [me.id]))[0] ?? null,
  }));
  const by = (...st: string[]) => claims.filter((c) => st.includes(c.status));
  const waiting = by('pending_work'), withFounders = by('ready', 'queried'), approved = by('approved'), paid = by('paid');
  const chart = [
    { stage: 'Work recorded', amount: sum(waiting) }, { stage: 'With founders', amount: sum(withFounders) },
    { stage: 'Approved', amount: sum(approved) }, { stage: 'Paid', amount: sum(paid) },
  ];
  const ym = (x: any) => String(x).slice(0, 7);
  const months = Object.entries([...payouts.map((p) => ({ m: ym(p.paid_on), a: p.amount_kes })), ...legacy.map((p) => ({ m: ym(p.paid_on), a: p.amount_kes }))]
    .reduce((acc: Record<string, number>, r) => ({ ...acc, [r.m]: (acc[r.m] ?? 0) + r.a }), {})).sort().slice(-6).map(([month, amount]) => ({ month, amount }));
  const mask = (p?: string | null) => (p ? `${p.slice(0, 4)} ••• ••${p.slice(-3)}` : '');

  return (
    <>
      <PageHeader image="/images/trainer-coaching.jpg" title="My earnings" subtitle="What you have earned from finished work, where each amount is in the process, and what has been paid to you." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Work recorded" value={kes(sum(waiting))} sub={waiting.length ? `${waiting.length} waiting for reports or sessions to be logged` : 'Nothing waiting'} />
        <Stat tone="gold" label="With the founders" value={kes(sum(withFounders))} sub={`${withFounders.length} to decide`} />
        <Stat tone="green" label="Approved, to be paid" value={kes(sum(approved))} sub={`${approved.length} claim${approved.length === 1 ? '' : 's'}`} />
        <Stat label="Paid to me" value={kes(sum(payouts) + sum(legacy))} sub="All payments on record" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="My claims" subtitle="Each one is a piece of work you have done. Approved claims are paid together." className="lg:col-span-2">
          <Table head={['Work', 'Amount', 'Where it is']} rows={claims.map((c) => {
            const at = CLAIM_STEPS.indexOf(c.status as any);
            return [
              <div key="w"><b>{c.description}</b><div className="text-xs text-slate-500">{c.cohort ?? 'General'} · {d(c.created_at)}</div>
                {c.status === 'pending_work' && <div className="mt-1 text-xs text-gold-600">Needs: {c.evidence?.cohort_ended === false ? 'the cohort to finish' : 'your day reports or session logs to be filed'}.</div>}</div>,
              kes(c.amount_kes),
              <div key="s"><div className="flex gap-1">{CLAIM_STEPS.map((s, i) => <span key={s} className={`h-2 w-8 rounded ${['declined', 'cancelled'].includes(c.status) ? 'bg-red-300' : i <= at ? 'bg-teal' : 'bg-teal-100'}`} title={CLAIM_LABEL[s]} />)}</div>
                <Badge tone={statusTone(c.status === 'pending_work' ? 'draft' : c.status === 'ready' ? 'submitted' : c.status)}>{CLAIM_LABEL[c.status]}</Badge></div>,
            ];
          })} empty="No claims yet. They appear when a cohort you worked on has finished and its work is recorded." />
        </Card>

        <div className="space-y-4">
          <Card title="Where my money is"><BarCard data={chart} x="stage" bars={[{ key: 'amount', label: 'KES', color: '#0D3B3B' }]} money height={210} /></Card>
          <Card title="How I am paid" subtitle="Only a number and the name it is registered in. No bank or card details are kept here.">
            {method && <p className="mb-3 text-sm"><b>{METHOD_LABEL[method.method]}</b>{method.phone ? ` · ${mask(method.phone)}` : ''} {method.verified_on ? <Badge tone="green">confirmed {d(method.verified_on)}</Badge> : <Badge tone="gold">not confirmed yet</Badge>}</p>}
            <form action={saveMethod} className="space-y-3 text-sm">
              <label className="block font-bold">Pay me by
                <select name="method" defaultValue={method?.method ?? 'mpesa'} className={`${inputCls} mt-1 font-normal`}><option value="mpesa">M-Pesa</option><option value="cash">Cash</option><option value="bank_transfer">Bank transfer (details given to a founder directly)</option></select></label>
              <label className="block font-bold">M-Pesa number<input name="phone" defaultValue={method?.phone ?? ''} placeholder="+2547…" className={`${inputCls} mt-1 font-normal`} /></label>
              <label className="block font-bold">Name it is registered in<input name="name" defaultValue={method?.account_name ?? ''} className={`${inputCls} mt-1 font-normal`} /></label>
              <button className={submitCls}>Save</button>
              <p className="text-xs text-slate-500">If you change the number, a founder confirms it with you again before paying.</p>
            </form>
          </Card>
        </div>
      </div>

      <Card className="mt-4" title="Payments I have received">
        <Table head={['Date', 'Amount', 'How', 'Reference']} rows={[
          ...payouts.map((p) => [d(p.paid_on), kes(p.amount_kes), METHOD_LABEL[p.method], p.reference ?? '—']),
          ...legacy.map((p) => [d(p.paid_on), kes(p.amount_kes), `Earlier ${p.kind}${p.cohort ? `, ${p.cohort}` : ''}`, '—']),
        ]} empty="Nothing paid yet." />
        {months.length > 1 && <div className="mt-4"><BarCard data={months} x="month" bars={[{ key: 'amount', label: 'Paid', color: '#2E8B7A' }]} money height={180} /></div>}
      </Card>
    </>
  );
}
