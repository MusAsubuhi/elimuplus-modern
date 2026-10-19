import { NextResponse } from 'next/server';
import { asAdmin } from '@/lib/db';
import { addDaysIso, alertFounders, createInvoice, docUrl, mailDoc, orgContacts, trainingEnds } from '@/lib/billing';

export const dynamic = 'force-dynamic';

/** Daily: about two weeks before the first follow-up visit, raise the one follow-up invoice and tell the partner. */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const today = new Date().toISOString().slice(0, 10);
  const horizon = addDaysIso(today, 14);
  const out: string[] = [];
  const cands = await asAdmin((q) => q(
    `select c.id, c.name, c.organisation_id, c.start_date, c.end_date, c.format, qt.id quote_id,
        (select min(sc.due_date) from followup_schedule sc join enrolments e on e.id=sc.enrolment_id where e.cohort_id=c.id) first_due,
        (select coalesce(sum(l.qty*l.unit_kes),0)::int from quote_lines l where l.quote_id=qt.id and l.kind like 'followup%') fee
       from cohorts c join quotes qt on qt.cohort_id=c.id and qt.status='signed'
      where c.status in ('confirmed','delivering','followup')
        and not exists (select 1 from invoices i where i.cohort_id=c.id and i.kind='followup')`));
  for (const c of cands) {
    if (!(c.fee > 0)) continue;
    const end = trainingEnds(c);
    const first = c.first_due ? String(c.first_due).slice(0, 10) : end ? addDaysIso(end, 30) : null;
    if (!first || first > horizon) continue;
    try {
      const inv = await asAdmin((q) => createInvoice(q, { quoteId: c.quote_id, orgId: c.organisation_id, cohortId: c.id, kind: 'followup', amount: c.fee, description: `30, 60 and 90-day follow-up visits for ${c.name}`, dueOn: first }));
      const to = await orgContacts(c.organisation_id);
      const err = await mailDoc(to, `Elimu+ invoice ${inv.number}: follow-up visits for ${c.name}`,
        `Our follow-up visits for ${c.name} begin on ${first}. Here is the invoice for the 30, 60 and 90-day visits, KES ${Number(c.fee).toLocaleString('en-KE')} in total, due before the first visit. After you pay, sign in and choose “I have paid” so we can send your receipt.`,
        [{ label: 'Open the invoice', url: docUrl('invoice', inv.token) }]);
      if (!err) await asAdmin((q) => q('update invoices set sent_at=now() where id=$1', [inv.id]));
      await asAdmin((q) => alertFounders(q, `Follow-up invoice ${inv.number} raised`, `${c.name}: KES ${Number(c.fee).toLocaleString('en-KE')}, first visit ${first}. ${err ? 'Email not sent: ' + err : 'Emailed to the partner.'}`, '/portal/deals', err ? 'attention' : 'info'));
      out.push(inv.number);
    } catch (e) { console.error('[billing cron]', c.id, e); }
  }
  return NextResponse.json({ raised: out });
}
