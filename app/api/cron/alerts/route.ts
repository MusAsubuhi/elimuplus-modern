import { NextResponse } from 'next/server';
import { flushAlerts } from '@/lib/mail';
import { asAdmin } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Daily safety net (Vercel cron): sends anything still queued, plus a reminder if reports or visits have been waiting. */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const stale = await asAdmin((q) => q(
    `insert into founder_alerts(kind, severity, title, body, link, source_table)
     select 'reminder', 'attention', n || ' day report' || case when n = 1 then '' else 's' end || ' not yet seen for over 2 days', 'Open Reports and mark them seen or actioned.', '/portal/reports', 'day_reports'
     from (select count(*)::int n from day_reports where status = 'submitted' and created_at < now() - interval '2 days') t
     where n > 0 and not exists (select 1 from founder_alerts where kind = 'reminder' and created_at > now() - interval '20 hours' and source_table = 'day_reports')
     returning id`));
  const unacked = await asAdmin((q) => q(
    `insert into founder_alerts(kind, severity, title, body, link, source_table)
     select 'reminder', 'attention', n || ' website enquir' || case when n = 1 then 'y has' else 'ies have' end || ' not been acknowledged', 'No confirmation email reached them. Open Website enquiries, resend it or copy the message and send it yourself.', '/portal/enquiries', 'web_enquiries'
     from (select count(*)::int n from web_enquiries where status = 'new' and ack_sent_at is null and created_at < now() - interval '1 hour') t
     where n > 0 and not exists (select 1 from founder_alerts where kind = 'reminder' and created_at > now() - interval '20 hours' and source_table = 'web_enquiries')
     returning id`));
  const r = await flushAlerts();
  return NextResponse.json({ ...r, reminders: stale.length + unacked.length });
}
