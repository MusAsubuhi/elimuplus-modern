import { asUser } from '@/lib/db';
import { requirePartner } from '@/lib/session';
import { Card, PageHeader, Stat, Table, inputCls, submitCls } from '@/components/ui';
import { d, kes } from '@/lib/format';
import { recordSupport, removeSupport } from '../../../partner-actions';

export default async function PartnerSupport({ searchParams }: { searchParams: Promise<{ cohort?: string }> }) {
  const me = await requirePartner();
  const sp = await searchParams;
  const { cohorts, people, entries } = await asUser(me.id, async (q) => ({
    cohorts: await q(`select c.id, c.name, c.status from cohorts c where c.organisation_id in (select app.my_org_admin_orgs()) and c.status in ('delivering','followup','closed') order by c.seq desc`),
    people: await q(`select r.id, r.cohort_id, r.enrolment_id, r.full_name from cohort_roster r where r.enrolment_id is not null order by r.full_name`),
    entries: await q(`select s.id, s.entry_date, s.item, s.amount_kes, s.funder, s.note, r.cohort_id, r.full_name
        from support_ledger s join cohort_roster r on r.enrolment_id=s.enrolment_id
        where s.source='partner' order by s.entry_date desc, s.created_at desc`),
  }));
  const chosen = cohorts.find((c) => c.id === sp.cohort) ?? cohorts[0];
  const today = new Date().toISOString().slice(0, 10);
  const mine = entries.filter((e) => e.cohort_id === chosen?.id);
  const total = mine.reduce((s, e) => s + e.amount_kes, 0);
  const given = new Set(mine.map((e) => e.full_name)).size;
  const here = people.filter((p) => p.cohort_id === chosen?.id);
  return (
    <>
      <PageHeader image="/images/partner-process-meeting.jpg" title="Support you gave participants" subtitle="If you gave a participant stock, tools, fees or cash to help them start or grow, record it here. We keep it apart from fees and costs, and it shows in the impact figures." />
      {!cohorts.length || !chosen ? <Card><p className="text-sm text-slate-600">Once a training is under way and its participants are enrolled, you can record the support you gave them here.</p></Card> : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {cohorts.map((c) => <a key={c.id} href={`/portal/partner/support?cohort=${c.id}`} className={`rounded-full px-3 py-1 text-sm font-bold ${c.id === chosen.id ? 'bg-teal text-white' : 'border border-teal-100 bg-white text-teal'}`}>{c.name}</a>)}
          </div>
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <Stat label="Support you recorded" value={kes(total)} sub={`for ${chosen.name}`} />
            <Stat tone="gold" label="Participants supported" value={`${given} of ${here.length}`} sub="you do not have to support everyone" />
          </div>
          <div className="grid gap-4 lg:grid-cols-5">
            <Card title="Record support" subtitle="One line for each item or payment" className="lg:col-span-2">
              {!here.length ? <p className="text-sm text-slate-600">No participants from your list have been enrolled yet. They appear here once the trainer enrols them on the first training day.</p> : (
                <form action={recordSupport} className="space-y-3 text-sm">
                  <input type="hidden" name="cohort" value={chosen.id} />
                  <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">Participant</span>
                    <select name="person" required className={inputCls}><option value="">Choose a participant</option>{here.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
                  <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">What was it for?</span>
                    <input name="item" required maxLength={200} placeholder="For example: starter stock, a sewing machine, school fees" className={inputCls} /></label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">Amount (KES)</span><input name="amount" type="number" min="1" required className={inputCls} /></label>
                    <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">Date given</span><input name="entry_date" type="date" max={today} defaultValue={today} required className={inputCls} /></label>
                  </div>
                  <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">Who gave it (optional)</span><input name="funder" maxLength={120} placeholder="Leave blank if it was your organisation" className={inputCls} /></label>
                  <label className="block"><span className="mb-1 block text-xs font-bold text-slate-600">Note (optional)</span><input name="note" maxLength={300} className={inputCls} /></label>
                  <button className={submitCls}>Save</button>
                </form>
              )}
            </Card>
            <Card title={`What you recorded for ${chosen.name}`} subtitle="You can remove a line if you made a mistake" className="lg:col-span-3">
              <Table head={['Date', 'Participant', 'Item', 'Amount', '']} empty="Nothing recorded yet."
                rows={mine.map((e) => [d(e.entry_date), <b key="n">{e.full_name ?? 'Participant'}</b>, <span key="i">{e.item}{e.funder ? <span className="block text-xs text-slate-500">from {e.funder}</span> : null}</span>, kes(e.amount_kes),
                  <form key="x" action={removeSupport}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="cohort" value={chosen.id} /><button className="text-xs font-bold text-red-700 underline">Remove</button></form>])} />
            </Card>
          </div>
        </>
      )}
    </>
  );
}
