import { asUser } from '@/lib/db';
import { requirePartner } from '@/lib/session';
import { Badge, Card, PageHeader, inputCls, statusTone, submitCls } from '@/components/ui';
import { d } from '@/lib/format';
import { dateRange } from '@/lib/billing';
import { requestCohortChange, withdrawCohortChange } from '../../../partner-actions';

const LABEL: Record<string, string> = { name: 'Name', start_date: 'Start date', venue: 'Venue', audience: 'Who will attend', language: 'Language', expected_participants: 'Number of participants' };
const show = (k: string, v: any) => (k === 'start_date' ? d(v) : k === 'language' ? (v === 'en' ? 'English' : 'Kiswahili') : String(v ?? '') || 'not set');
const tone = (s: string) => (s === 'approved' ? 'green' : s === 'denied' ? 'red' : s === 'pending' ? 'gold' : 'grey');

export default async function PartnerTrainings({ searchParams }: { searchParams: Promise<{ cohort?: string }> }) {
  const me = await requirePartner();
  const sp = await searchParams;
  const { cohorts, reqs } = await asUser(me.id, async (q) => ({
    cohorts: await q(`select c.* from cohorts c where c.organisation_id in (select app.my_org_admin_orgs()) order by c.seq desc`),
    reqs: await q(`select * from cohort_change_requests order by created_at desc`),
  }));
  return (
    <>
      <PageHeader image="/images/partner-process-meeting.jpg" title="Your trainings" subtitle="See each training you have booked. To change a detail, send a request: nothing changes until someone at Elimu+ approves it." />
      {!cohorts.length && <Card><p className="text-sm text-slate-600">You have not booked a training yet. <a className="font-bold text-teal underline" href="/portal/partner/request">Request one here.</a></p></Card>}
      <div className="space-y-4">
        {cohorts.map((c) => {
          const mine = reqs.filter((r) => r.cohort_id === c.id);
          const pending = mine.find((r) => r.status === 'pending');
          const editable = ['requested', 'quoted', 'confirmed'].includes(c.status);
          const open = sp.cohort === c.id || cohorts.length === 1;
          return (
            <Card key={c.id} title={c.name} subtitle={`${dateRange(c, d)} · ${c.venue || 'venue to be set'}`} action={<Badge tone={statusTone(c.status)}>{c.status}</Badge>}>
              <p className="text-sm text-slate-700">{c.audience || 'Audience not set'} · {c.language === 'en' ? 'English' : 'Kiswahili'} · {c.expected_participants ?? '?'} participants expected</p>
              {pending && (
                <div className="mt-3 rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm">
                  <p className="font-bold text-teal">A change is waiting for a decision{pending.late ? ' (marked urgent: the training is close)' : ''}</p>
                  <ul className="mt-1 list-disc pl-5">{Object.entries(pending.changes as Record<string, any>).map(([k, v]) => <li key={k}>{LABEL[k]}: {show(k, (pending.before as any)[k])} to <b>{show(k, v)}</b></li>)}</ul>
                  <p className="mt-1 text-xs text-slate-600">Your reason: {pending.reason}</p>
                  <form action={withdrawCohortChange} className="mt-2"><input type="hidden" name="request" value={pending.id} /><input type="hidden" name="cohort" value={c.id} /><button className="rounded border border-teal-100 bg-white px-3 py-1 text-xs font-bold text-teal">Withdraw this request</button></form>
                </div>
              )}
              {!pending && editable && (
                <details className="mt-3 rounded-lg bg-mist p-3 text-sm" open={open}>
                  <summary className="cursor-pointer font-bold text-teal">Request a change</summary>
                  <form action={requestCohortChange} className="mt-3 space-y-3">
                    <input type="hidden" name="cohort" value={c.id} />
                    <p className="text-xs text-slate-600">Fill in only what you want to change and leave the rest as it is.</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="font-bold">Name<input name="name" defaultValue={c.name} className={inputCls} /></label>
                      <label className="font-bold">Start date<input name="start_date" type="date" defaultValue={c.start_date ? String(c.start_date).slice(0, 10) : ''} className={inputCls} /></label>
                      <label className="font-bold">Venue<input name="venue" defaultValue={c.venue || ''} className={inputCls} /></label>
                      <label className="font-bold">Who will attend<input name="audience" defaultValue={c.audience || ''} className={inputCls} /></label>
                      <label className="font-bold">Language<select name="language" defaultValue={c.language} className={inputCls}><option value="sw">Kiswahili</option><option value="en">English</option></select></label>
                      <label className="font-bold">Number of participants<input name="expected_participants" type="number" min="1" defaultValue={c.expected_participants ?? ''} className={inputCls} /></label>
                    </div>
                    <label className="block font-bold">Why is the change needed?<textarea name="reason" required rows={2} className={inputCls} /></label>
                    <button className={submitCls}>Send request</button>
                    <p className="text-xs text-slate-500">Changes close to the start date are looked at urgently but are not guaranteed, because trainers, venues and participants have been arranged around the current plan.</p>
                  </form>
                </details>
              )}
              {!pending && !editable && <p className="mt-3 text-xs text-slate-500">This training has started or finished, so it can no longer be changed here. Please call us if something is wrong.</p>}
              {mine.filter((r) => r.status !== 'pending').length > 0 && (
                <div className="mt-3 text-sm"><p className="font-bold text-teal">Earlier requests</p>
                  <ul className="mt-1 space-y-1">{mine.filter((r) => r.status !== 'pending').map((r) => (
                    <li key={r.id}><Badge tone={tone(r.status)}>{r.status}</Badge> {d(r.created_at)}: {Object.keys(r.changes).map((k) => LABEL[k]).join(', ')}{r.decision_note ? ` · ${r.decision_note}` : ''}</li>))}</ul></div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
