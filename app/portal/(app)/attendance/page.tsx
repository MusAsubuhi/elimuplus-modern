import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, submitCls } from '@/components/ui';
import { d } from '@/lib/format';
import AttendanceTicks from '@/components/attendance-ticks';
import { ensureSessions } from '@/lib/sessions';
import { markAttendance } from '../../actions';

const iso = (x: any) => (x instanceof Date ? x.toISOString().slice(0, 10) : String(x ?? '').slice(0, 10));

export default async function Attendance({ searchParams }: { searchParams: Promise<{ c?: string; s?: string }> }) {
  const me = await requireMe('facilitator', 'founder');
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const cards = await asUser(me.id, async (q) => {
    // cohorts that are running, or start in the next two days; each gets its programme days created if they are missing
    const cohorts = await q(`select c.id, c.name, c.format, c.start_date, o.name org_name from cohorts c join organisations o on o.id=c.organisation_id
      where c.status in ('confirmed','delivering') and c.start_date is not null and c.start_date <= current_date + 2 order by c.start_date`);
    const out: any[] = [];
    for (const c of cohorts) {
      await ensureSessions(q, c.id);
      const sessions = await q('select id, day_number, session_date, attendance_confirmed_at from sessions where cohort_id=$1 order by day_number', [c.id]);
      if (!sessions.length || iso(sessions[sessions.length - 1].session_date) < today && sessions.every((x: any) => x.attendance_confirmed_at)) continue; // finished and all confirmed
      // default day: the one chosen, else today's, else the earliest unconfirmed day that has already happened, else the next day
      const chosen: any = (sp.c === c.id ? sessions.find((x: any) => x.id === sp.s) : undefined)
        ?? sessions.find((x: any) => iso(x.session_date) === today)
        ?? sessions.find((x: any) => iso(x.session_date) < today && !x.attendance_confirmed_at)
        ?? sessions.find((x: any) => iso(x.session_date) > today) ?? sessions[sessions.length - 1];
      const roster = await q("select e.id, p.display_name from enrolments e join people p on p.id=e.person_id where e.cohort_id=$1 and e.status <> 'dropped' order by p.display_name", [c.id]);
      const rows = await q('select enrolment_id, present from attendance where session_id=$1', [chosen.id]);
      out.push({ c, sessions, chosen, roster, present: new Set(rows.filter((r: any) => r.present).map((r: any) => r.enrolment_id)), recorded: rows.length > 0 });
    }
    return out;
  });
  const waiting = cards.reduce((t, k) => t + k.sessions.filter((x: any) => iso(x.session_date) <= today && !x.attendance_confirmed_at).length, 0);
  return (
    <>
      <PageHeader image="/images/home-facilitator.jpg" title="Daily attendance" subtitle="Confirm who came each day. If the attendance form was filled in, its ticks are already here: check them, correct anyone, and confirm." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Cohorts in session" value={cards.length} />
        <Stat tone={waiting ? 'gold' : 'green'} label="Days not confirmed yet" value={waiting} />
        <Stat label="Today" value={d(today)} />
      </div>
      {cards.length === 0 && <Card><p className="text-sm text-slate-600">No cohort is in session. Attendance appears here from the day a confirmed cohort starts. For a past cohort, open it from <Link href="/portal/cohorts" className="font-bold text-teal underline">Cohorts</Link>.</p></Card>}
      <div className="space-y-4">
        {cards.map(({ c, sessions, chosen, roster, present, recorded }) => (
          <Card key={c.id} title={c.name} subtitle={`${c.org_name} · ${c.format === '12-day' ? '12' : '5'}-day programme · ${roster.length} participants`}>
            <div className="mb-3 flex flex-wrap gap-2">
              {sessions.map((x: any) => (
                <Link key={x.id} href={`/portal/attendance?c=${c.id}&s=${x.id}`} className={`rounded-full px-3 py-1 text-sm font-bold ${x.id === chosen.id ? 'bg-teal text-white' : 'border border-teal-100 bg-white text-teal'}`}>
                  Day {x.day_number}{x.attendance_confirmed_at ? ' ✓' : iso(x.session_date) <= today ? ' •' : ''}
                </Link>))}
            </div>
            <p className="mb-2 text-sm text-slate-600">Day {chosen.day_number} · {d(chosen.session_date)}{iso(chosen.session_date) === today ? ' (today)' : ''} {chosen.attendance_confirmed_at ? <Badge tone="green">confirmed</Badge> : recorded ? <Badge tone="gold">from the form, not yet confirmed</Badge> : <Badge tone="grey">not recorded</Badge>}</p>
            <form action={markAttendance} className="rounded-lg bg-mist p-3">
              <input type="hidden" name="cohort" value={c.id} /><input type="hidden" name="session" value={chosen.id} /><input type="hidden" name="back" value="attendance" />
              <AttendanceTicks key={chosen.id} people={roster.map((r: any) => ({ id: r.id, name: r.display_name }))} present={roster.filter((r: any) => present.has(r.id)).map((r: any) => r.id)} />
              <button className={`${submitCls} mt-3`}>Confirm attendance for Day {chosen.day_number}</button>
            </form>
            <p className="mt-2 text-xs text-slate-500">Someone who came but is not listed? Add them on the <Link href={`/portal/cohorts/${c.id}`} className="font-bold text-teal underline">cohort page</Link>, or through the attendance form. The day summary for the partner is also written there.</p>
          </Card>))}
      </div>
    </>
  );
}
