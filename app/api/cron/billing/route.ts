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

  // Certificates are the thing we always forget: remind the founders until they are issued.
  const reminded: string[] = [];
  const dueCerts = await asAdmin((q) => q(
    `select c.id, c.name, count(e.id)::int n from cohorts c join organisations o on o.id=c.organisation_id and not o.is_internal
       join enrolments e on e.cohort_id=c.id and e.status <> 'dropped'
      where c.status in ('delivering','followup') and c.certificates_issued_on is null
        and coalesce(c.end_date, c.start_date + (case when c.format='12-day' then 11 else 4 end)) <= current_date
        and not exists (select 1 from founder_alerts a where a.kind='certificates' and a.link = '/portal/cohorts/' || c.id::text and a.created_at > now() - interval '4 days')
      group by c.id, c.name`));
  for (const c of dueCerts) {
    await asAdmin((q) => alertFounders(q, `Certificates not issued yet: ${c.name}`, `${c.n} participants finished training and have no certificate. Open the cohort, tick who qualifies and issue them, then print.`, `/portal/cohorts/${c.id}`, 'attention', 'certificates'));
    reminded.push(c.name);
  }
  const noCert = await asAdmin((q) => q(
    `select p.id, p.full_name, ra.tier from role_assignments ra join people p on p.id=ra.person_id
      where ra.role='facilitator' and ra.status='active' and coalesce(ra.tier,0) >= 1
        and not exists (select 1 from certifications c where c.person_id=ra.person_id and c.tier=ra.tier and c.status='active')
        and not exists (select 1 from founder_alerts a where a.kind='certificates' and a.title like '%' || p.full_name || '%' and a.created_at > now() - interval '7 days')`));
  for (const t of noCert) {
    await asAdmin((q) => alertFounders(q, `Tier ${t.tier} certificate missing: ${t.full_name}`, 'This trainer holds the level but no certificate has been issued. Open Team and people to issue it.', '/portal/team', 'attention', 'certificates'));
    reminded.push(t.full_name);
  }
  return NextResponse.json({ released, raised: out, reminded });
}
