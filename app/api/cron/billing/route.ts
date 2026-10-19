import { NextResponse } from 'next/server';
import { asAdmin } from '@/lib/db';
import { addDaysIso, alertFounders, createInvoice, docUrl, mailDoc, orgContacts, releaseDueQuotes, splitFollowup, visitDates } from '@/lib/billing';

export const dynamic = 'force-dynamic';

/**
 * Daily: send any partner-requested quotation whose waiting time is over, then invoice each follow-up visit
 * (30, 60, 90 days) separately, about two weeks before it. Only cohorts whose quotation was accepted in the portal are billed.
 */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const released = await releaseDueQuotes().catch((e) => { console.error('[release]', e); return 0; });
  const today = new Date().toISOString().slice(0, 10);
  const horizon = addDaysIso(today, 14), earliest = addDaysIso(today, -3);
  const out: string[] = [];
  const cands = await asAdmin((q) => q(
    `select c.id, c.name, c.organisation_id, c.start_date, c.end_date, c.format, qt.id quote_id,
        (select coalesce(sum(l.qty*l.unit_kes),0)::int from quote_lines l where l.quote_id=qt.id and l.kind like 'followup%') fee
       from cohorts c join quotes qt on qt.cohort_id=c.id and qt.status='signed' and qt.accepted_at is not null
      where c.status in ('confirmed','delivering','followup')`));
  for (const c of cands) {
    if (!(c.fee > 0)) continue;
    const planned = visitDates(c);
    const actual = await asAdmin((q) => q(`select sc.visit, min(sc.due_date) due from followup_schedule sc join enrolments e on e.id=sc.enrolment_id where e.cohort_id=$1 group by sc.visit`, [c.id]));
    const amounts = splitFollowup(c.fee);
    for (const pv of planned) {
      const due = String(actual.find((a: any) => a.visit === pv.visit)?.due ?? pv.due).slice(0, 10);
      if (due > horizon || due < earliest) continue;
      try {
        const inv = await asAdmin(async (q) => {
          if ((await q("select 1 from invoices where cohort_id=$1 and kind='followup' and visit=$2", [c.id, pv.visit])).length) return null;
          return createInvoice(q, { quoteId: c.quote_id, orgId: c.organisation_id, cohortId: c.id, kind: 'followup', visit: pv.visit as 30 | 60 | 90, amount: amounts[pv.visit], description: `${pv.visit}-day follow-up visit for ${c.name}`, dueOn: due });
        });
        if (!inv) continue;
        const err = await mailDoc(await orgContacts(c.organisation_id), `Elimu+ invoice ${inv.number}: ${pv.visit}-day follow-up for ${c.name}`,
          `Our ${pv.visit}-day follow-up visit for ${c.name} is planned for ${due}. Here is the invoice for this visit, KES ${amounts[pv.visit].toLocaleString('en-KE')}, due before the visit. After you pay, sign in and choose “I have paid” so we can send your receipt.`,
          [{ label: 'Open the invoice', url: docUrl('invoice', inv.token) }]);
        if (!err) await asAdmin((q) => q('update invoices set sent_at=now() where id=$1', [inv.id]));
        await asAdmin((q) => alertFounders(q, `Follow-up invoice ${inv.number} raised`, `${c.name}, ${pv.visit}-day visit on ${due}: KES ${amounts[pv.visit].toLocaleString('en-KE')}. ${err ? 'Email not sent: ' + err : 'Emailed to the partner.'}`, '/portal/deals', err ? 'attention' : 'info'));
        out.push(inv.number);
      } catch (e) { console.error('[billing cron]', c.id, pv.visit, e); }
    }
  }
  return NextResponse.json({ released, raised: out });
}
