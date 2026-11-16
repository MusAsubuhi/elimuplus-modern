import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, submitCls } from '@/components/ui';
import { d } from '@/lib/format';
import { decideCohortChange } from '../../change-actions';

const LABEL: Record<string, string> = { name: 'Name', start_date: 'Start date', venue: 'Venue', audience: 'Who will attend', language: 'Language', expected_participants: 'Participants' };
const show = (k: string, v: any) => (k === 'start_date' ? d(v) : k === 'language' ? (v === 'en' ? 'English' : 'Kiswahili') : String(v ?? '') || 'not set');

export default async function Changes() {
  const me = await requireMe('founder');
  const rows = await asUser(me.id, (q) => q(`select r.*, c.status cohort_status, c.name cohort_name, o.name org_name,
      (select count(*)::int from cohort_roster x where x.cohort_id=c.id and x.status<>'withdrawn') listed
      from cohort_change_requests r join cohorts c on c.id=r.cohort_id join organisations o on o.id=r.organisation_id order by (r.status='pending') desc, r.late desc, r.created_at desc limit 60`));
  const pending = rows.filter((r) => r.status === 'pending');
  return (
    <>
      <PageHeader image="/images/hero-bg.jpg" title="Change requests" subtitle="Partners cannot edit a booked training themselves. They ask here, and nothing changes until you approve it." />
      <div className="space-y-3">
        {!pending.length && <Card><p className="text-sm text-slate-600">No change requests are waiting.</p></Card>}
        {pending.map((r) => (
          <Card key={r.id} title={`${r.org_name}: ${r.cohort_name}`} subtitle={`Asked ${d(r.created_at)}`} action={r.late ? <Badge tone="red">Training is close</Badge> : undefined}>
            <ul className="list-disc pl-5 text-sm">{Object.entries(r.changes as Record<string, any>).map(([k, v]) => <li key={k}>{LABEL[k]}: {show(k, (r.before as any)[k])} to <b>{show(k, v)}</b></li>)}</ul>
            <p className="mt-2 text-sm"><b>Reason:</b> {r.reason}</p>
            {'expected_participants' in r.changes && <p className="mt-1 text-xs text-slate-600">{r.listed} people are already listed. Approving recalculates an unsigned quotation.</p>}
            {r.late && <p className="mt-1 text-xs font-bold text-red-700">The training starts within a week. Changing it now may disturb trainers, the venue and participants.</p>}
            <form action={decideCohortChange} className="mt-3 flex flex-wrap items-center gap-2">
              <input type="hidden" name="request" value={r.id} />
              <input name="note" placeholder="Note to the partner (needed if denying)" className="w-72 rounded border border-teal-100 px-2 py-1 text-sm" />
              <button name="decision" value="approve" className={submitCls}>Approve and apply</button>
              <button name="decision" value="deny" className="rounded border border-red-300 bg-white px-3 py-2 text-sm font-bold text-red-700">Deny</button>
            </form>
          </Card>
        ))}
        {rows.filter((r) => r.status !== 'pending').length > 0 && (
          <Card title="Decided">
            <ul className="space-y-1 text-sm">{rows.filter((r) => r.status !== 'pending').map((r) => <li key={r.id}><Badge tone={r.status === 'approved' ? 'green' : r.status === 'denied' ? 'red' : 'grey'}>{r.status}</Badge> {r.org_name}, {r.cohort_name}: {Object.keys(r.changes).map((k) => LABEL[k]).join(', ')}{r.decision_note ? ` · ${r.decision_note}` : ''}</li>)}</ul>
          </Card>
        )}
      </div>
    </>
  );
}
