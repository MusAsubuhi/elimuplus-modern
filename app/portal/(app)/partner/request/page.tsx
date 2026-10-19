import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Table, inputCls, statusTone, submitCls } from '@/components/ui';
import { requestCohort } from '../../../actions';
import { d } from '@/lib/format';
import { releaseDueQuotes } from '@/lib/billing';
import { CONTACT } from '@/lib/pricing';

export default async function RequestTraining() {
  const me = await requireMe('org_admin');
  await releaseDueQuotes().catch(() => {});
  const { orgs, reqs, qcount, pending } = await asUser(me.id, async (q) => ({
    orgs: await q('select id, name from organisations where id in (select app.my_org_admin_orgs()) order by name'),
    qcount: (await q('select count(*)::int n from quotes'))[0].n,
    pending: (await q("select count(*)::int n from quotes where self_service and status='draft'"))[0].n,
    reqs: await q(`select c.*, o.name org_name from cohorts c join organisations o on o.id=c.organisation_id where c.status in ('requested','quoted','confirmed') order by c.created_at desc`),
  }));
  return (
    <>
      <PageHeader image="/images/partner-process-meeting.jpg" title="Request a training" subtitle="Tell us who, where and when. We will prepare your proposal and quotation and send them to you. Nothing is booked until you confirm." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Your request">
          {pending > 0 ? <p className="rounded-lg bg-mist p-3 text-sm text-slate-700">We are preparing your proposal and quotation. You will get them by email and find them under Invoices and payments shortly.</p>
          : qcount > 0 ? <p className="rounded-lg bg-mist p-3 text-sm text-slate-700">Your organisation already has a quotation with us. To plan another cohort, please contact Elimu+ on {CONTACT.phone} or {CONTACT.email}.</p>
          : <form action={requestCohort} className="space-y-3 text-sm">
            <label className="block font-bold">Organisation<select name="org" className={inputCls}>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
            <label className="block font-bold">Name for this cohort<input name="name" placeholder="e.g. Youth cohort, March" className={inputCls} /></label>
            <label className="block font-bold">Programme<select name="format" className={inputCls}><option value="5-day">5-Day Programme (intensive)</option><option value="12-day">12-Day Programme (full)</option></select></label>
            <label className="block font-bold">Language<select name="language" className={inputCls}><option value="sw">Kiswahili</option><option value="en">English</option></select></label>
            <label className="block font-bold">Who will attend?<input name="audience" placeholder="Youth 15 to 24, caregivers, students" className={inputCls} /></label>
            <label className="block font-bold">Number of participants<input name="size" type="number" min="1" className={inputCls} /></label>
            <label className="block font-bold">Preferred start date<input name="start" type="date" className={inputCls} /></label>
            <label className="block font-bold">Venue<input name="venue" className={inputCls} /></label>
            <button className={submitCls}>Request proposal and quotation</button>
            <p className="text-xs text-slate-500">You can ask for one quotation yourself. For anything further, or a different arrangement, contact us.</p>
          </form>}
        </Card>
        <Card title="Requests and bookings" className="lg:col-span-2">
          <Table head={['Cohort', 'Programme', 'Preferred start', 'Size', 'Status']} rows={reqs.map((c) => [<b key="n">{c.name}</b>, c.format === '12-day' ? '12-Day' : '5-Day', d(c.start_date), c.expected_participants ?? '—', <Badge key="s" tone={statusTone(c.status)}>{c.status}</Badge>])} empty="No open requests." />
          <p className="mt-3 text-xs text-slate-500">Quotes always show the training fee and the 30, 60 and 90 day follow-up visits as separate lines.</p>
        </Card>
      </div>
    </>
  );
}
