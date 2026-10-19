import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requirePartner } from '@/lib/session';
import { Badge, Card, PageHeader, statusTone } from '@/components/ui';
import { d, daysFromToday, kes } from '@/lib/format';
import { releaseDueQuotes, visitDates } from '@/lib/billing';

const when = (iso: string) => {
  const n = daysFromToday(iso);
  return n === 0 ? 'today' : n > 0 ? `in ${n} day${n === 1 ? '' : 's'}` : `${-n} day${n === -1 ? '' : 's'} ago`;
};

function Step({ done, title, children }: { done: boolean; title: string; children?: React.ReactNode }) {
  return (
    <li className="relative pl-8">
      <span className={`absolute left-0 top-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${done ? 'bg-teal text-white' : 'border border-slate-300 bg-white text-slate-400'}`}>{done ? '✓' : ''}</span>
      <p className="text-sm font-bold">{title}</p>
      <div className="text-sm text-slate-600">{children}</div>
    </li>
  );
}

export default async function Timeline() {
  const me = await requirePartner();
  await releaseDueQuotes().catch(() => {});
  const X = await asUser(me.id, async (q) => ({
    cohorts: await q(`select c.*, o.name org_name from cohorts c join organisations o on o.id=c.organisation_id where c.organisation_id in (select app.my_org_admin_orgs()) order by c.seq`),
    quotes: await q(`select * from quotes where status in ('signed') order by accepted_at desc`),
    invoices: await q(`select i.*, coalesce((select sum(amount_kes) from payments p where p.invoice_id=i.id),0)::int paid from invoices i`),
    roster: await q(`select cohort_id, status, count(*)::int n from cohort_roster group by cohort_id, status`),
    sums: await q(`select * from day_summaries order by day_number`),
    names: await q(`select summary_id, name, present from day_summary_names order by name`),
    seminars: await q(`select title, held_on, venue from seminars where held_on >= current_date order by held_on limit 6`),
    reports: await q(`select id, cohort_id, title, type, released_on from reports where status='released' order by released_on desc`),
  }));
  return (
    <>
      <PageHeader image="/images/partner-hero.jpg" title="Our deliverables" subtitle="Every step from the first quotation to the 90-day follow-up, with dates, what we have done and what comes next." />
      {!X.cohorts.length && <Card><p className="text-sm text-slate-600">Your cohorts will appear here once a training is requested.</p></Card>}
      <div className="space-y-6">
        {X.cohorts.map((c) => {
          const quote = X.quotes.find((x) => x.cohort_id === c.id);
          const invs = X.invoices.filter((i) => i.cohort_id === c.id || (quote && i.quote_id === quote.id));
          const trainingInv = invs.find((i) => i.kind !== 'followup');
          const followInvs = invs.filter((i) => i.kind === 'followup');
          const loaded = X.roster.filter((r) => r.cohort_id === c.id && r.status !== 'withdrawn').reduce((a, r) => a + r.n, 0);
          const sums = X.sums.filter((s) => s.cohort_id === c.id);
          const visits = visitDates(c);
          const rep = X.reports.filter((r) => r.cohort_id === c.id);
          const trained = ['delivering', 'followup', 'closed'].includes(c.status);
          return (
            <Card key={c.id} title={c.name} subtitle={`${c.format === '12-day' ? '12-Day' : '5-Day'} programme · ${d(c.start_date) || 'date to be set'} · ${c.venue ?? ''}`} action={<Badge tone={statusTone(c.status)}>{c.status}</Badge>}>
              <ol className="space-y-5 border-l border-teal-100 pl-1">
                <Step done={!!quote} title="Quotation agreed">{quote ? <>Accepted {d(quote.accepted_at ?? quote.issued_on)}{quote.number ? ` (${quote.number})` : ''}.</> : 'Waiting for your response to our quotation.'}</Step>
                <Step done={loaded > 0 && loaded >= (c.expected_participants ?? 1)} title="Participants loaded">
                  {loaded} of {c.expected_participants ?? '—'} people listed. {!trained && <Link href={`/portal/partner/roster?cohort=${c.id}`} className="font-bold text-teal underline">Add or review names</Link>}
                </Step>
                <Step done={!!trainingInv && trainingInv.paid >= trainingInv.amount_kes} title="Training invoice">
                  {trainingInv ? <>{trainingInv.number} · {kes(trainingInv.amount_kes)} · due {d(trainingInv.due_on)} · <Badge tone={statusTone(trainingInv.status)}>{trainingInv.status}</Badge></> : 'Raised once the quotation is accepted.'}
                </Step>
                <Step done={sums.length > 0 && (c.status === 'followup' || c.status === 'closed')} title="Training days">
                  {sums.length ? (
                    <div className="mt-1 space-y-2">
                      {sums.map((s) => {
                        const nm = X.names.filter((n) => n.summary_id === s.id);
                        return (
                          <details key={s.id} className="rounded-lg bg-mist p-2">
                            <summary className="cursor-pointer font-bold text-slate-700">Day {s.day_number} · {d(s.held_on)} · {s.present_count} present, {s.absent_count} absent</summary>
                            {s.covered && <p className="mt-1"><b>Covered:</b> {s.covered}</p>}
                            {s.note_for_partner && <p className="mt-1"><b>For you:</b> {s.note_for_partner}</p>}
                            {nm.length > 0 && (
                              <div className="mt-2 grid gap-x-4 sm:grid-cols-2">
                                <div><p className="text-xs font-bold uppercase text-slate-500">Attended</p>{nm.filter((n) => n.present).map((n) => <p key={n.name}>{n.name}</p>)}</div>
                                <div><p className="text-xs font-bold uppercase text-slate-500">Did not attend</p>{nm.filter((n) => !n.present).map((n) => <p key={n.name}>{n.name}</p>)}{!nm.some((n) => !n.present) && <p className="text-slate-400">Everyone came</p>}</div>
                              </div>
                            )}
                          </details>
                        );
                      })}
                    </div>
                  ) : 'A summary appears here after each training day.'}
                </Step>
                <Step done={false} title="30, 60 and 90 day follow-up visits">
                  {visits.length ? (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {visits.map((v) => <span key={v.visit} className="rounded-lg border border-teal-100 bg-white px-3 py-1 text-xs"><b>{v.visit} days</b> · {d(v.due)} · {when(v.due)}</span>)}
                    </div>
                  ) : 'Dates are set once the training dates are confirmed.'}
                  <div className="mt-2 space-y-1">
                    {visits.map((v) => { const inv = followInvs.find((i) => i.visit === v.visit); return (
                      <p key={v.visit}>{v.visit}-day visit: {inv
                        ? <>{inv.number} · {kes(inv.amount_kes)} · due {d(inv.due_on)} · <Badge tone={statusTone(inv.status)}>{inv.status}</Badge></>
                        : <>invoice follows about two weeks before the visit, around {d(new Date(new Date(v.due).getTime() - 14 * 86400000))}</>}</p>); })}
                  </div>
                </Step>
                <Step done={rep.length > 0} title="Reports released to you">
                  {rep.length ? rep.map((r) => <span key={r.id} className="mr-2 inline-block">{r.title} ({d(r.released_on)})</span>) : 'Reports are released after our team has reviewed them.'}
                  {rep.length > 0 && <> <Link href="/portal/partner/library" className="font-bold text-teal underline">Open reports</Link></>}
                </Step>
              </ol>
            </Card>
          );
        })}
      </div>
      <Card title="Monthly meet-ups" subtitle="Open to the people you have trained" className="mt-6">
        {X.seminars.length ? <ul className="space-y-1 text-sm">{X.seminars.map((s) => <li key={s.held_on + s.title}><b>{d(s.held_on)}</b> · {s.title}{s.venue ? ` · ${s.venue}` : ''} <span className="text-slate-500">({when(s.held_on)})</span></li>)}</ul> : <p className="text-sm text-slate-500">The next meet-up will be announced here.</p>}
      </Card>
    </>
  );
}
