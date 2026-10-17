import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, Table, inputCls, statusTone, submitCls } from '@/components/ui';
import { d, kes } from '@/lib/format';
import { audit } from '@/lib/audit';
import { decideExpense, markExpensePaid } from '../../actions';

export default async function Approvals() {
  const me = await requireMe('founder');
  await audit(me.id, 'view approvals', 'expense_requests');
  const { reqs, thr } = await asUser(me.id, async (q) => ({
    reqs: await q(`select r.*, p.display_name requester, c.name cohort, k.name category,
        (select string_agg(a.approver_id::text || ':' || a.decision, ',') from expense_approvals a where a.request_id=r.id) votes,
        (select count(distinct approver_id)::int from expense_approvals a where a.request_id=r.id and a.decision='approve') approvals
        from expense_requests r join people p on p.id=r.requester_id left join cohorts c on c.id=r.cohort_id left join expense_categories k on k.id=r.category_id
        order by case r.status when 'submitted' then 0 when 'queried' then 1 when 'approved' then 2 else 3 end, r.created_at desc`),
    thr: Number((await q("select value from settings where key='expense_threshold_kes'"))[0]?.value ?? 20000),
  }));
  const queue = reqs.filter((r) => ['submitted', 'queried'].includes(r.status));
  const toPay = reqs.filter((r) => r.status === 'approved');
  const history = reqs.filter((r) => !['submitted', 'queried', 'approved'].includes(r.status));
  return (
    <>
      <PageHeader image="/images/trainer-team.jpg" title="Approvals" subtitle={`Either founder can approve up to ${kes(thr)}. Above that both must approve. Nobody approves their own request.`} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat tone="gold" label="To decide" value={queue.length} sub={kes(queue.reduce((s, r) => s + r.amount_kes, 0))} />
        <Stat tone="green" label="Approved, not yet paid" value={toPay.length} sub={kes(toPay.reduce((s, r) => s + r.amount_kes, 0))} />
        <Stat label="Threshold for two approvals" value={kes(thr)} />
      </div>
      <div className="space-y-4">
        {queue.map((r) => {
          const need = r.amount_kes > thr ? 2 : 1;
          const mine = r.votes?.split(',').find((v: string) => v.startsWith(me.id));
          const own = r.requester_id === me.id;
          return (
            <Card key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="text-lg font-bold text-teal">{kes(r.amount_kes)} · {r.reason}</h3>
                  <p className="text-sm text-slate-600">{r.requester} · {r.category ?? 'Other'} · {r.cohort ?? 'General'} · {d(r.created_at)}</p></div>
                <div className="text-right"><Badge tone={statusTone(r.status)}>{r.status}</Badge><div className="mt-1 text-xs text-slate-500">{r.approvals}/{need} approval{need > 1 ? 's' : ''}{need > 1 ? ' (above threshold)' : ''}</div></div>
              </div>
              {own ? <p className="mt-3 text-sm font-semibold text-[#C8553D]">This is your own request. The other founder must decide.</p>
                : (
                <form action={decideExpense} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                  <input type="hidden" name="request" value={r.id} />
                  <input name="note" placeholder={mine ? `You already voted: ${mine.split(':')[1]}` : 'Note (optional)'} className={inputCls} />
                  <button name="decision" value="approve" className={submitCls}>Approve</button>
                  <button name="decision" value="query" className="rounded-lg border border-gold px-4 py-2 text-sm font-bold text-gold-600">Query</button>
                  <button name="decision" value="decline" className="rounded-lg border border-[#C8553D] px-4 py-2 text-sm font-bold text-[#C8553D]">Decline</button>
                </form>)}
            </Card>
          );
        })}
        {!queue.length && <Card>Nothing waiting. 🎉</Card>}
      </div>
      {toPay.length > 0 && (
        <Card title="Approved: record the payment" className="mt-4">
          {toPay.map((r) => (
            <form key={r.id} action={markExpensePaid} className="grid items-center gap-2 border-b border-slate-100 py-2 text-sm last:border-0 sm:grid-cols-[2fr_1fr_2fr_auto]">
              <input type="hidden" name="request" value={r.id} />
              <span><b>{r.requester}</b> · {r.reason}</span>
              <input name="paid" type="number" defaultValue={r.amount_kes} className={inputCls} />
              <input name="receipt" placeholder="Receipt note / M-Pesa code" className={inputCls} />
              <button className={submitCls}>Mark paid</button>
            </form>))}
        </Card>
      )}
      <Card title="History" className="mt-4">
        <Table head={['Date', 'Who', 'For', 'Amount', 'Paid', 'Status']} rows={history.map((r) => [d(r.created_at), r.requester, r.reason, kes(r.amount_kes), r.paid_amount_kes ? kes(r.paid_amount_kes) : '—', <Badge key="s" tone={statusTone(r.status)}>{r.status}</Badge>])} />
      </Card>
    </>
  );
}
