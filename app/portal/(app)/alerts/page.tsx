import Link from 'next/link';
import { asUser, asAdmin } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, inputCls, submitCls } from '@/components/ui';
import { markAlertsRead, sendAlertsNow, setMyEmail } from '../../ops-actions';

const tone = (s: string) => (s === 'urgent' ? 'red' : s === 'attention' ? 'gold' : 'grey');
const when = (t: string) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });

export default async function Alerts() {
  const me = await requireMe('founder');
  const { alerts, myEmail } = await asUser(me.id, async (q) => ({
    alerts: await q(`select a.*, (r.alert_id is not null) read from founder_alerts a left join alert_reads r on r.alert_id=a.id and r.person_id=$1 order by (r.alert_id is not null), a.created_at desc limit 100`, [me.id]),
    myEmail: (await q('select email from people where id=$1', [me.id]))[0]?.email ?? '',
  }));
  const founders = await asAdmin((q) => q("select distinct p.display_name, p.email from people p join role_assignments r on r.person_id=p.id where r.role='founder' and r.status='active' order by 1"));
  const unread = alerts.filter((a) => !a.read);
  const waiting = alerts.filter((a) => !a.emailed_at).length;
  const mailOn = !!process.env.RESEND_API_KEY;
  return (
    <>
      <PageHeader image="/images/home-community.jpg" title="Alerts" subtitle="Every report, request, suggestion, welfare flag and venue issue lands here and is emailed to the founders, so nothing sits unseen." />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat tone={unread.length ? 'gold' : 'green'} label="Not yet seen by you" value={unread.length} />
        <Stat tone={unread.some((a) => a.severity === 'urgent') ? 'red' : 'green'} label="Urgent" value={unread.filter((a) => a.severity === 'urgent').length} />
        <Stat tone={mailOn ? 'green' : 'red'} label="Email" value={mailOn ? 'On' : 'Not set up'} sub={mailOn ? `${waiting} waiting to send` : 'Add RESEND_API_KEY in Vercel'} />
        <Stat label="Founders with an email" value={`${founders.filter((f) => f.email).length}/${founders.length}`} sub="Alerts go to each" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Where alerts are emailed" subtitle="Each founder sets their own address.">
          <form action={setMyEmail} className="flex flex-wrap items-end gap-2 text-sm">
            <label className="flex-1 font-bold">My email<input name="email" type="email" defaultValue={myEmail} placeholder="you@example.com" className={inputCls} /></label>
            <button className={submitCls}>Save</button>
          </form>
          <ul className="mt-3 space-y-1 text-xs text-slate-600">{founders.map((f) => <li key={f.display_name}>{f.display_name}: {f.email ?? <b className="text-[#C8553D]">no email yet</b>}</li>)}</ul>
          <form action={sendAlertsNow} className="mt-3"><button className="rounded-lg border border-teal px-3 py-1.5 text-xs font-bold text-teal">Send waiting alerts now</button></form>
        </Card>
        <Card title="Inbox" className="lg:col-span-2" action={unread.length > 0 ? <form action={markAlertsRead}><button className="rounded-lg border border-teal px-3 py-1 text-xs font-bold text-teal">Mark all seen</button></form> : undefined}>
          {alerts.length === 0 ? <p className="text-sm text-slate-600">Nothing yet.</p> : (
            <ul className="divide-y divide-teal-50">{alerts.map((a) => (
              <li key={a.id} className={`flex flex-wrap items-start justify-between gap-2 py-3 ${a.read ? 'opacity-60' : ''}`}>
                <div className="min-w-0 max-w-xl">
                  <div className="flex flex-wrap items-center gap-2"><b className="text-sm">{a.title}</b>{a.severity !== 'info' && <Badge tone={tone(a.severity)}>{a.severity}</Badge>}</div>
                  {a.body && <p className="text-sm text-slate-700">{String(a.body).slice(0, 300)}</p>}
                  <p className="text-xs text-slate-500">{when(a.created_at)} · {a.emailed_at ? 'emailed' : a.email_error ? `email failed: ${a.email_error}` : 'waiting to be emailed'}{a.link && <> · <Link className="font-bold text-teal underline" href={a.link}>Open</Link></>}</p>
                </div>
                {!a.read && <form action={markAlertsRead}><input type="hidden" name="alert" value={a.id} /><button className="rounded-lg border border-teal px-2 py-1 text-xs font-bold text-teal">Seen</button></form>}
              </li>))}</ul>)}
        </Card>
      </div>
    </>
  );
}
