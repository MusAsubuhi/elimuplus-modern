import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { CLAIM_LABEL, METHOD_LABEL, RATE_KINDS } from '@/lib/payouts';
import { Badge, Card, PageHeader, Stat, Table, inputCls, statusTone, submitCls } from '@/components/ui';
import { d, kes } from '@/lib/format';
import { addManualClaim, cancelClaim, decideClaim, deleteRate, generateForCohort, saveRate, verifyMethod } from '../../payout-actions';

const TABS: [string, string][] = [['approve', 'To approve'], ['pay', 'To pay'], ['paid', 'Paid'], ['generate', 'Work done'], ['rates', 'Rates']];

export default async function Payouts({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireMe('founder');
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : 'approve';
  await audit(me.id, 'view trainer payments', 'payout_claims');
  const D = await asUser(me.id, async (q) => ({
    thr: Number((await q("select coalesce((select value #>> '{}' from settings where key='payout_threshold_kes'), (select value #>> '{}' from settings where key='expense_threshold_kes'), '20000') v"))[0].v),
    claims: await q(`select c.*, p.display_name person, co.name cohort,
        (select count(*)::int from payout_approvals a where a.claim_id=c.id and a.decision='approve') approvals,
        (select string_agg(a.approver_id::text || ':' || a.decision, ',') from payout_approvals a where a.claim_id=c.id) votes
        from payout_claims c join people p on p.id=c.person_id left join cohorts co on co.id=c.cohort_id order by c.created_at`),
    payouts: await q('select o.*, p.display_name person from payouts o join people p on p.id=o.person_id order by o.paid_on desc, o.created_at desc limit 100'),
    methods: await q('select * from payout_methods'),
    rates: await q('select * from payout_rates order by kind, tier nulls first, format nulls first'),
    cohorts: await q("select id, name, status, format from cohorts where status in ('delivering','followup','closed') order by seq"),
    people: await q(`select distinct p.id, p.display_name from people p join role_assignments r on r.person_id=p.id where r.role in ('facilitator','founder') and r.status='active' order by p.display_name`),
  }));
  const { thr, claims, payouts, methods, rates, cohorts, people } = D;
  const queue = claims.filter((c) => ['ready', 'queried'].includes(c.status));
  const approved = claims.filter((c) => c.status === 'approved');
  const waiting = claims.filter((c) => c.status === 'pending_work');
  const byPerson = Object.values(approved.reduce((m: Record<string, any>, c) => { (m[c.person_id] ??= { id: c.person_id, name: c.person, items: [], total: 0 }).items.push(c); m[c.person_id].total += c.amount_kes; return m; }, {}));
  const mine = (pid: string) => methods.find((m) => m.person_id === pid);
  const sum = (r: any[]) => r.reduce((s, c) => s + Number(c.amount_kes), 0);

  return (
    <>
      <PageHeader image="/images/trainer-team.jpg" title="Trainer payments" subtitle={`Pay trainers for finished work. Either founder approves up to ${kes(thr)}; above that both must. Nobody approves or pays their own claim.`} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat tone="gold" label="To approve" value={kes(sum(queue))} sub={`${queue.length} claim${queue.length === 1 ? '' : 's'}`} />
        <Stat tone="green" label="Approved, not yet paid" value={kes(sum(approved))} sub={`${byPerson.length} trainer${byPerson.length === 1 ? '' : 's'}`} />
        <Stat label="Work not yet recorded" value={kes(sum(waiting))} sub={`${waiting.length} waiting on reports or logs`} />
        <Stat label="Paid so far" value={kes(sum(payouts))} sub={`${payouts.length} payment${payouts.length === 1 ? '' : 's'}`} />
      </div>
      <nav className="mb-5 flex flex-wrap gap-2 text-sm" aria-label="Sections">
        {TABS.map(([k, l]) => <Link key={k} href={`/portal/payouts?tab=${k}`} className={`rounded-full border px-4 py-1.5 font-semibold ${tab === k ? 'border-teal bg-teal text-white' : 'border-teal-100 bg-white text-teal'}`}>{l}{k === 'approve' && queue.length ? ` (${queue.length})` : k === 'pay' && byPerson.length ? ` (${byPerson.length})` : ''}</Link>)}
      </nav>

      {tab === 'approve' && (
        <div className="space-y-4">
          {queue.map((c) => {
            const need = c.amount_kes > thr ? 2 : 1;
            const own = c.person_id === me.id;
            const voted = c.votes?.split(',').find((v: string) => v.startsWith(me.id))?.split(':')[1];
            return (
              <Card key={c.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="text-lg font-bold text-teal">{kes(c.amount_kes)} · {c.person}</h3>
                    <p className="text-sm text-slate-600">{c.description}{c.cohort ? ` · ${c.cohort}` : ''}</p>
                    {c.evidence && Object.keys(c.evidence).length > 0 && <p className="mt-1 text-xs text-slate-500">Checked against: {Object.entries(c.evidence).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(' · ')}</p>}</div>
                  <div className="text-right"><Badge tone={statusTone(c.status === 'ready' ? 'submitted' : c.status)}>{CLAIM_LABEL[c.status]}</Badge><div className="mt-1 text-xs text-slate-500">{c.approvals}/{need} approval{need > 1 ? 's' : ''}{need > 1 ? ' (above threshold)' : ''}</div></div>
                </div>
                {own ? <p className="mt-3 rounded-lg bg-gold-100 p-3 text-sm text-gold-600">This is your own claim. The other founder decides it.</p> : (
                  <form action={decideClaim} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                    <input type="hidden" name="claim" value={c.id} />
                    <input name="note" placeholder="Note (optional)" className={inputCls} />
                    <button name="decision" value="approve" disabled={voted === 'approve'} className={submitCls}>{voted === 'approve' ? 'You approved' : 'Approve'}</button>
                    <button name="decision" value="query" className="rounded-lg border border-teal px-4 py-2 text-sm font-bold text-teal">Query</button>
                    <button name="decision" value="decline" className="rounded-lg border border-[#C8553D] px-4 py-2 text-sm font-bold text-[#C8553D]">Decline</button>
                  </form>
                )}
              </Card>
            );
          })}
          {!queue.length && <Card>Nothing waiting for a decision. Claims appear here by themselves: the training pays when it ends, and each field visit pays as soon as it is recorded. “Work done” only re-checks a cohort.</Card>}
        </div>
      )}

      {tab === 'pay' && (
        <div className="grid gap-4 md:grid-cols-2">
          {byPerson.map((p: any) => {
            const m = mine(p.id);
            return (
              <Card key={p.id} title={p.name} subtitle={`${p.items.length} approved claim${p.items.length === 1 ? '' : 's'}`}
                action={<span className="text-xl font-bold text-teal">{kes(p.total)}</span>}>
                <ul className="mb-3 space-y-1 text-sm text-slate-600">{p.items.map((c: any) => <li key={c.id} className="flex justify-between gap-3"><span>{c.description}</span><span>{kes(c.amount_kes)}</span></li>)}</ul>
                <p className="mb-3 text-xs">{m ? <>{METHOD_LABEL[m.method]}{m.phone ? ` · ${m.phone}` : ''} {m.verified_on ? <Badge tone="green">confirmed</Badge> : <Badge tone="gold">not confirmed</Badge>}</> : <Badge tone="red">no payment details yet</Badge>}</p>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/portal/payouts/pay/${p.id}`} className={`${submitCls} inline-block`}>{p.id === me.id ? 'The other founder pays this' : 'Open payment page'}</Link>
                  {m && !m.verified_on && m.person_id !== me.id && <form action={verifyMethod}><input type="hidden" name="person" value={p.id} /><button className="rounded-lg border border-teal px-4 py-2 text-sm font-bold text-teal">Mark details confirmed</button></form>}
                </div>
              </Card>
            );
          })}
          {!byPerson.length && <Card>No approved claims waiting for payment.</Card>}
        </div>
      )}

      {tab === 'paid' && (
        <Card title="Payments recorded">
          <Table head={['Date', 'Trainer', 'Amount', 'How', 'Reference', 'Recorded by']} rows={payouts.map((p) => [d(p.paid_on), p.person, kes(p.amount_kes), METHOD_LABEL[p.method], p.reference ?? '—', p.provider === 'manual' ? 'Founder' : 'Portal'])} empty="No payments recorded yet." />
        </Card>
      )}

      {tab === 'generate' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Create claims from finished work" subtitle="Claims are made automatically when work is recorded; this re-checks a cohort, for example after you add a missing rate. Run it any time; approved and paid claims are never changed.">
            <form action={generateForCohort} className="space-y-3 text-sm">
              <label className="block font-bold">Cohort<select name="cohort" required className={`${inputCls} mt-1 font-normal`}>{cohorts.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}</select></label>
              <button className={submitCls}>Work out what is owed</button>
              {!rates.length && <p className="rounded-lg bg-gold-100 p-3 text-xs text-gold-600">No rates are set yet, so nothing can be calculated. Add them on the Rates tab first.</p>}
            </form>
          </Card>
          <Card title="Add a claim by hand" subtitle="For work the portal does not track, such as preparing materials. It still needs approval.">
            <form action={addManualClaim} className="space-y-3 text-sm">
              <label className="block font-bold">Who<select name="person" required className={`${inputCls} mt-1 font-normal`}>{people.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>
              <label className="block font-bold">Cohort (optional)<select name="cohort" className={`${inputCls} mt-1 font-normal`}><option value="">None</option>{cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="block font-bold">What the work was<input name="description" required className={`${inputCls} mt-1 font-normal`} /></label>
              <label className="block font-bold">Amount (KES)<input name="amount" type="number" min="1" required className={`${inputCls} mt-1 font-normal`} /></label>
              <button className={submitCls}>Add claim</button>
            </form>
          </Card>
          <Card className="lg:col-span-2" title="Waiting for the work to be recorded">
            <Table head={['Trainer', 'Work', 'Amount', 'Checked so far', '']} rows={waiting.map((c) => [c.person, c.description, kes(c.amount_kes), Object.entries(c.evidence ?? {}).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · '),
              <form key="x" action={cancelClaim}><input type="hidden" name="claim" value={c.id} /><button className="text-xs font-bold text-[#C8553D] underline">Cancel</button></form>])} empty="Nothing is waiting." />
          </Card>
        </div>
      )}

      {tab === 'rates' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Rate card" subtitle="Only founders see this. Trainers see what they are owed, not the rates." className="lg:col-span-2">
            <Table head={['For', 'Tier', 'Format', 'Amount', '']} rows={rates.map((r) => [RATE_KINDS[r.kind], r.tier === null ? 'Every tier' : `Tier ${r.tier}`, r.format ?? 'Any', kes(r.amount_kes),
              <form key="x" action={deleteRate}><input type="hidden" name="id" value={r.id} /><button className="text-xs font-bold text-[#C8553D] underline">Remove</button></form>])} empty="No rates yet." />
          </Card>
          <Card title="Set a rate" subtitle="Saving over an existing rate replaces it. A rate for an exact tier and format beats a general one.">
            <form action={saveRate} className="space-y-3 text-sm">
              <label className="block font-bold">For<select name="kind" className={`${inputCls} mt-1 font-normal`}>{Object.entries(RATE_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="block font-bold">Tier<select name="tier" className={`${inputCls} mt-1 font-normal`}><option value="">Every tier</option>{[0, 1, 2, 3, 4].map((t) => <option key={t} value={t}>Tier {t}</option>)}</select></label>
              <label className="block font-bold">Format (delivery only)<select name="format" className={`${inputCls} mt-1 font-normal`}><option value="">Any</option><option value="5-day">5-Day</option><option value="12-day">12-Day</option></select></label>
              <label className="block font-bold">Amount (KES)<input name="amount" type="number" min="1" required className={`${inputCls} mt-1 font-normal`} /></label>
              <button className={submitCls}>Save rate</button>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
