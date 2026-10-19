import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, statusTone } from '@/components/ui';
import { d, pct } from '@/lib/format';
import { BarCard } from '@/components/charts';

export default async function Cohorts() {
  const me = await requireMe('facilitator', 'founder');
  const { rows, due } = await asUser(me.id, async (q) => ({
    rows: await q(`select c.*, o.name org_name,
      (select count(*) from enrolments e where e.cohort_id=c.id)::int n,
      (select count(*) from enrolments e where e.cohort_id=c.id and e.status='completed')::int completed,
      (select count(distinct a.box_number) from canvas_answers a join canvases cv on cv.id=a.canvas_id join enrolments e on e.id=cv.enrolment_id where e.cohort_id=c.id)::int boxes_touched,
      (select count(*) from canvas_unlocks u where u.cohort_id=c.id)::int unlocked
      from cohorts c join organisations o on o.id=c.organisation_id order by c.seq`),
    due: await q(`select s.visit, s.status, s.due_date, s.id, p.display_name, c.id cohort_id
      from followup_schedule s join enrolments e on e.id=s.enrolment_id join people p on p.id=e.person_id join cohorts c on c.id=e.cohort_id
      where s.status='scheduled' order by s.due_date`),
  }));
  const overdue = due.filter((x) => new Date(x.due_date) < new Date(new Date().toDateString()));
  const chart = rows.map((r) => ({ cohort: r.name.replace(' (demo figures)', '').replace(' (demo)', ''), enrolled: r.n, completed: r.completed }));
  return (
    <>
      <PageHeader image="/images/home-facilitator.jpg" title="My cohorts" subtitle="Every cohort you are assigned to, with attendance, canvas progress and follow-up tasks." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Cohorts" value={rows.length} />
        <Stat tone="green" label="Participants" value={rows.reduce((s, r) => s + r.n, 0)} />
        <Stat tone={overdue.length ? 'red' : 'gold'} label="Follow-ups overdue" value={overdue.length} sub={`${due.length} open in total`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {rows.map((c) => (
            <Link key={c.id} href={`/portal/cohorts/${c.id}`} className="block">
              <Card className="transition hover:border-gold hover:shadow-md">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-teal">{c.name}</h3>
                    <p className="text-sm text-slate-600">{c.org_name} · {c.format === '12-day' ? '12-Day' : '5-Day'} · {c.language === 'sw' ? 'Kiswahili' : 'English'} · {d(c.start_date)} to {d(c.end_date)}</p>
                  </div>
                  <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-center text-sm">
                  <div><div className="text-2xl font-bold text-ink">{c.n}</div><div className="text-xs text-slate-500">enrolled</div></div>
                  <div><div className="text-2xl font-bold text-ink">{pct(c.completed, c.n)}%</div><div className="text-xs text-slate-500">completed</div></div>
                  <div><div className="text-2xl font-bold text-ink">{c.unlocked}/12</div><div className="text-xs text-slate-500">boxes unlocked</div></div>
                </div>
              </Card>
            </Link>
          ))}
          {!rows.length && <Card>You are not assigned to a cohort yet.</Card>}
        </div>
        <div className="space-y-4">
          <Card title="Enrolled vs completed"><BarCard data={chart} x="cohort" height={220} bars={[{ key: 'enrolled', label: 'Enrolled' }, { key: 'completed', label: 'Completed', color: '#D4A843' }]} /></Card>
          <Card title="Follow-ups waiting" subtitle="Oldest first">
            <ul className="space-y-2 text-sm">
              {due.slice(0, 6).map((x) => (
                <li key={x.id} className="flex items-center justify-between">
                  <Link href={`/portal/cohorts/${x.cohort_id}`} className="font-semibold text-teal underline">{x.display_name} · {x.visit}-day</Link>
                  <Badge tone={new Date(x.due_date) < new Date() ? 'red' : 'blue'}>{d(x.due_date)}</Badge>
                </li>
              ))}
              {!due.length && <li className="text-slate-500">All caught up.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
