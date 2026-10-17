import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, Table, inputCls, submitCls } from '@/components/ui';
import { d } from '@/lib/format';
import { orgTypeLabel } from '@/lib/options';
import { logActivity } from '../../ops-actions';

const today = () => new Date().toISOString().slice(0, 10);
const tick = (ok: boolean, yes = 'Yes', no = 'Not yet') => <Badge tone={ok ? 'green' : 'gold'}>{ok ? `✓ ${yes}` : no}</Badge>;

export default async function Crm({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireMe('founder', 'master');
  const { tab = 'orgs' } = await searchParams;
  const { orgs, people } = await asUser(me.id, async (q) => ({
    orgs: await q(`select o.id, o.name, o.type, o.county, o.ward, o.venue_name, s.*,
        (select string_agg(distinct k.status, ', ') from cohorts k where k.organisation_id=o.id and k.status <> 'closed') cohort_status
      from organisations o join crm_org_status s on s.organisation_id=o.id where not o.is_internal
      order by (s.called and s.visited and s.checks_complete), s.next_action_due nulls last, o.name`),
    people: await q(`select i.id, i.full_name, i.contact, i.role, i.status, n.display_name nominator, s.called, s.last_contact_on, s.next_action_due
      from invitations i join crm_person_status s on s.invitation_id=i.id left join people n on n.id=i.nominated_by
      where i.status in ('nominated','approved') order by s.called, i.created_at`),
  }));
  const today0 = today();
  const overdue = (dt?: string | null) => !!dt && String(dt).slice(0, 10) < today0;
  const notReady = orgs.filter((o) => !(o.called && o.visited && o.checks_complete));
  const tabLink = (k: string, label: string) => <Link href={`/portal/crm?tab=${k}`} className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === k ? 'bg-teal text-white' : 'border border-teal-100 bg-white text-teal'}`}>{label}</Link>;
  return (
    <>
      <PageHeader image="/images/home-community.jpg" title="Partners and people: call, visit, check" subtitle="Nothing is confirmed until the organisation has been called, visited and has passed the room and facilities checks. People are called before they get an account." />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Organisations" value={orgs.length} />
        <Stat tone={notReady.length ? 'gold' : 'green'} label="Not ready to run a programme" value={notReady.length} />
        <Stat tone={orgs.filter((o) => overdue(o.next_action_due)).length ? 'red' : 'green'} label="Follow-ups overdue" value={orgs.filter((o) => overdue(o.next_action_due)).length} />
        <Stat tone={people.some((p) => !p.called) ? 'gold' : 'green'} label="People not yet called" value={people.filter((p) => !p.called).length} />
      </div>
      <div className="mb-4 flex gap-2">{tabLink('orgs', 'Organisations')}{tabLink('people', `People${people.some((p) => !p.called) ? ` (${people.filter((p) => !p.called).length} to call)` : ''}`)}</div>
      {tab === 'orgs' && (
        <Card title="Organisations" subtitle="Open one to log a call or visit, tick the venue checks, and confirm its cohorts.">
          <Table head={['Organisation', 'Called', 'Visited', 'Venue checks', 'Last contact', 'Next action', 'Cohort']} rows={orgs.map((o) => [
            <Link key="n" href={`/portal/crm/${o.id}`} className="font-bold text-teal underline">{o.name}<div className="text-xs font-normal text-slate-500">{orgTypeLabel(o.type)} · {[o.ward, o.county].filter(Boolean).join(', ')}</div></Link>,
            tick(o.called, `${o.calls} call${o.calls === 1 ? '' : 's'}`, o.calls ? `${o.calls} tried` : 'Not yet'),
            tick(o.visited, `${o.visits} visit${o.visits === 1 ? '' : 's'}`, o.visits ? `${o.visits} tried` : 'Not yet'),
            <span key="c"><Badge tone={o.checks_complete ? 'green' : o.issues ? 'red' : 'gold'}>{o.required_ok}/{o.required_total}</Badge>{o.issues > 0 && <span className="ml-1 text-xs font-bold text-[#C8553D]">{o.issues} issue{o.issues === 1 ? '' : 's'}</span>}</span>,
            o.last_contact_on ? d(o.last_contact_on) : <span key="l" className="text-slate-400">never</span>,
            o.next_action_due ? <span key="a" className={overdue(o.next_action_due) ? 'font-bold text-[#C8553D]' : ''}>{d(o.next_action_due)}</span> : '',
            o.cohort_status ?? <span key="x" className="text-slate-400">none</span>])} empty="No organisations yet." />
        </Card>)}
      {tab === 'people' && (
        <Card title="People suggested" subtitle="A person is called before a founder creates their account. Log the call here; reaching them is what counts.">
          {people.length === 0 ? <p className="text-sm text-slate-600">Nobody is waiting.</p> : (
            <ul className="space-y-3">{people.map((p) => (
              <li key={p.id} id={`p-${p.id}`} className="rounded-lg border border-teal-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><b>{p.full_name}</b> <span className="text-xs text-slate-500">· {p.contact} · as {String(p.role).replace(/_/g, ' ')} · suggested by {p.nominator ?? 'a partner'}</span></span>
                  {tick(p.called, 'Called', 'Not called')}
                </div>
                <form action={logActivity} className="mt-2 grid gap-2 sm:grid-cols-6">
                  <input type="hidden" name="invitation" value={p.id} /><input type="hidden" name="back" value="/portal/crm?tab=people" />
                  <select name="kind" className={inputCls}><option value="call">Phone call</option><option value="whatsapp">WhatsApp</option><option value="visit">Visit</option><option value="note">Note</option></select>
                  <select name="outcome" className={inputCls}><option value="reached">Reached them</option><option value="no_answer">No answer</option><option value="not_interested">Not interested</option></select>
                  <input name="summary" required placeholder="What was said" className={`${inputCls} sm:col-span-3`} />
                  <button className={submitCls}>Log</button>
                </form>
              </li>))}</ul>)}
        </Card>)}
    </>
  );
}
