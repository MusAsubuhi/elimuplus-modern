import { asUser } from '@/lib/db';
import { requirePartner } from '@/lib/session';
import { Badge, Card, PageHeader, Table, statusTone } from '@/components/ui';
import { requestCohort } from '../../../actions';
import { RequestForm } from '@/components/request-form';
import { d } from '@/lib/format';
import { releaseDueQuotes } from '@/lib/billing';
import { CONTACT } from '@/lib/pricing';

export default async function RequestTraining() {
  const me = await requirePartner();
  await releaseDueQuotes().catch(() => {});
  const { orgs, reqs, pending } = await asUser(me.id, async (q) => ({
    orgs: await q('select id, name from organisations o where id in (select app.my_org_admin_orgs()) order by name'),
    pending: (await q("select count(*)::int n from quotes where self_service and status='draft'"))[0].n,
    reqs: await q(`select c.*, o.name org_name from cohorts c join organisations o on o.id=c.organisation_id where c.status in ('requested','quoted','confirmed') order by c.created_at desc`),
  }));
  return (
    <>
      <PageHeader image="/images/partner-process-meeting.jpg" title="Request a training" subtitle="Tell us who, where and when, for one training or a whole series of back-to-back trainings. We will prepare a proposal and quotation for each and send them to you. Nothing is booked until you confirm." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Your request">
          {pending > 0 && <p className="mb-3 rounded-lg bg-mist p-3 text-sm text-slate-700">We are preparing {pending === 1 ? 'a proposal and quotation' : `${pending} proposals and quotations`} from your earlier request. You will get {pending === 1 ? 'it' : 'them'} by email and find {pending === 1 ? 'it' : 'them'} under Invoices and payments shortly. You can send another request below at any time.</p>}
          {orgs.length === 0 ? <p className="rounded-lg bg-mist p-3 text-sm text-slate-700">Your account is not linked to an organisation yet. Write to <a className="underline" href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> or call {CONTACT.phone} and we will set it up.</p>
          : <RequestForm orgs={orgs as { id: string; name: string }[]} action={requestCohort} />}
        </Card>
        <Card title="Requests and bookings" className="lg:col-span-2">
          <Table head={['Cohort', 'Programme', 'Preferred start', 'Size', 'Status']} rows={reqs.map((c) => [<b key="n">{c.name}</b>, c.format === '12-day' ? '12-Day' : '5-Day', d(c.start_date), c.expected_participants ?? '—', <Badge key="s" tone={statusTone(c.status)}>{c.status}</Badge>])} empty="No open requests." />
          <p className="mt-3 text-xs text-slate-500">Your quotation covers the training only. The 30, 60 and 90 day follow-up visits are quoted separately once the training is done.</p>
        </Card>
      </div>
    </>
  );
}
