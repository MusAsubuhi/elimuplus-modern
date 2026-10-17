import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { loadImpact, totals } from '@/lib/impact';
import { Outcomes } from '@/components/outcomes';
import { Badge, Card, PageHeader, Stat, Table, statusTone } from '@/components/ui';
import { d, kes, pct } from '@/lib/format';

export default async function Impact({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const me = await requireMe('founder', 'master');
  const sp = await searchParams;
  const list = await asUser(me.id, (q) => loadImpact(q));
  const t = totals(list);
  const a90 = t.adult('90'), a30 = t.adult('30');
  const pick = list.find((c) => c.id === sp.c);
  return (
    <>
      <PageHeader title="Impact" subtitle="What changed for participants, across every cohort. Built from the baseline, follow-up and exit forms; totals only." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="People trained" value={t.enrolled} sub={`${t.completed} completed · ${t.female} women · ${t.male} men`} />
        <Stat tone="green" label="Trading at 30 days" value={a30.sold14Known ? `${pct(a30.sold14, a30.sold14Known)}%` : '—'} sub={a30.n ? `${a30.sold14} of ${a30.sold14Known} reached` : 'No visits yet'} />
        <Stat tone="gold" label="Trading at 90 days" value={a90.sold14Known ? `${pct(a90.sold14, a90.sold14Known)}%` : '—'} sub={a90.n ? `${a90.sold14} of ${a90.sold14Known} reached` : 'No visits yet'} />
        <Stat label="Support given" value={kes(t.supportKes)} sub={`${t.supportPeople} participants`} />
      </div>
      <Card title="Cohorts" subtitle="Open one to see its full results.">
        <Table head={['Cohort', 'Partner', 'Dates', 'Status', 'Enrolled', 'Attendance', 'Trading at 90 days', 'Learning gain']} rows={list.map((c) => {
          const a = c.m.adult?.['90'] ?? {};
          return [<Link key="n" href={`/portal/impact?c=${c.id}`} className="font-bold text-teal underline">{c.name}</Link>, c.org, `${d(c.start)} to ${d(c.end)}`, <Badge key="s" tone={statusTone(c.status)}>{c.status}</Badge>,
            c.m.enrolled, c.m.attendance_rate != null ? `${c.m.attendance_rate}%` : '—', a.sold14_known ? `${pct(a.sold14, a.sold14_known)}% (${a.sold14_known})` : '—',
            c.m.learning?.paired_n ? `+${c.m.learning.paired_gain} pts` : '—'];
        })} />
      </Card>
      {pick && <div className="mt-6"><h2 className="mb-3 text-lg font-extrabold text-teal">{pick.name}</h2><Outcomes m={pick.m} /></div>}
    </>
  );
}
