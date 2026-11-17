import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireFeature } from '@/lib/access';
import { audit } from '@/lib/audit';
import { Badge, Card, PageHeader, Stat, inputCls, submitCls } from '@/components/ui';
import { d } from '@/lib/format';
import { FOCUS, FORM, MENTOR_STATUS, MENTOR_TONE } from '@/lib/mentoring';
import { createCircle, startVetting } from '../../mentoring-actions';
import { dismissEnquiry } from '../../enquiry-actions';

export const dynamic = 'force-dynamic';

const FIELD: Record<string, string> = { full_name: 'Name', email: 'Email', phone: 'Phone', location: 'Where they live', occupation: 'What they do', serves: 'Who they would like to mentor', languages: 'Languages', hours: 'Hours a month', background: 'Background', motivation: 'Why they want to mentor', referee_name: 'Referee', referee_phone: 'Referee phone', agreed: 'Agreed to the conditions' };

const Bar = ({ label, n, total }: { label: string; n: number; total: number }) => (
  <div className="flex items-center gap-2 text-xs"><span className="w-40 shrink-0 text-slate-600">{label}</span>
    <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-mist"><span className="block h-full rounded-full bg-gold" style={{ width: `${total ? Math.round((100 * n) / total) : 0}%` }} /></span>
    <span className="w-6 text-right font-bold text-teal">{n}</span></div>
);

export default async function Mentoring() {
  const me = await requireFeature('mentoring');
  await audit(me.id, 'view mentoring', 'mentors');
  const D = await asUser(me.id, async (q) => ({
    apps: await q("select * from web_enquiries where kind='mentor' and status='new' order by created_at"),
    mentors: await q("select m.*, (select count(*)::int from mentoring_circles c where c.mentor_id=m.id and c.status<>'closed') circles from mentors m where m.status in ('vetting','active','paused') order by (m.status='vetting') desc, m.full_name"),
    cohorts: await q("select id, name from cohorts where status in ('confirmed','delivering','followup') order by seq desc"),
    circles: await q(`select c.id, c.name, c.status, c.focus, c.has_minors, co.name cohort_name, m.full_name mentor_name,
        (select count(*)::int from circle_members x where x.circle_id=c.id and x.status='active') members,
        (select count(*)::int from circle_meetings t where t.circle_id=c.id and t.status='held') held,
        (select max(t.held_on) from circle_meetings t where t.circle_id=c.id and t.status='held') last_held
      from mentoring_circles c join cohorts co on co.id=c.cohort_id join mentors m on m.id=c.mentor_id order by (c.status='closed'), c.created_at desc`),
    sum: (await q('select app.mentoring_summary() r'))[0].r as any,
  }));
  const active = D.mentors.filter((m: any) => m.status === 'active');
  const fb = D.sum.feedback;
  const T = FORM.en;
  return (
    <>
      <PageHeader title="Mentoring" subtitle="Mentors apply on the website and wait here for you. Nobody gets a sign-in until you have spoken with them, called their referee, briefed them on safeguarding and recorded their signed agreement. Circles are small groups from one cohort, led by one vetted mentor." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat tone={D.apps.length ? 'gold' : 'teal'} label="Applications waiting" value={D.apps.length} />
        <Stat label="In vetting" value={D.sum.mentors.vetting} />
        <Stat tone="green" label="Active mentors" value={D.sum.mentors.active} />
        <Stat label="Circles running" value={D.sum.circles.active} sub={`${D.sum.circles.planned} planned`} />
        <Stat label="Sessions held" value={D.sum.meetings} sub={`${D.sum.hours} hours, ${D.sum.people} people`} />
      </div>

      {D.apps.length > 0 && (
        <Card className="mb-6" title="Applications from the website" subtitle="Read each one properly. Starting vetting creates a record only; it sends nothing and creates no sign-in.">
          <div className="space-y-4">
            {D.apps.map((r: any) => {
              const p = (r.payload ?? {}) as Record<string, string>;
              return (
                <div key={r.id} className="rounded-lg border border-teal-100 p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2"><b className="text-teal">{r.name || r.email}</b><span className="text-xs text-slate-500">sent {d(r.created_at)}</span></div>
                  <dl className="mb-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    {Object.entries(p).filter(([, v]) => v).map(([k, v]) => (
                      <div key={k} className={k === 'motivation' || k === 'background' ? 'sm:col-span-2' : ''}><dt className="text-xs font-semibold text-slate-500">{FIELD[k] ?? k.replace(/_/g, ' ')}</dt><dd className="text-slate-800">{v}</dd></div>
                    ))}
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <form action={startVetting}><input type="hidden" name="id" value={r.id} /><button className={submitCls}>Start vetting</button></form>
                    <form action={dismissEnquiry}><input type="hidden" name="id" value={r.id} /><button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Set aside</button></form>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Mentors" subtitle="Open one to record vetting steps or to pass, pause or decline.">
          {D.mentors.length === 0 ? <p className="text-sm text-slate-600">No mentors yet. Applications from the website appear above.</p> : (
            <ul className="space-y-2 text-sm">
              {D.mentors.map((m: any) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-mist p-3">
                  <div><Link href={`/portal/mentoring/mentor/${m.id}`} className="font-bold text-teal underline">{m.full_name}</Link>
                    <div className="text-xs text-slate-500">{m.county ?? ''}{m.occupation ? ` · ${m.occupation}` : ''}{m.status === 'active' ? ` · ${m.circles} circle${m.circles === 1 ? '' : 's'}` : ''}</div></div>
                  <div className="flex items-center gap-2">
                    {m.status === 'vetting' && <span className="text-xs text-slate-500">{[m.interview_on, m.referee_on, m.briefing_on, m.agreement_on].filter(Boolean).length}/4 steps</span>}
                    <Badge tone={MENTOR_TONE[m.status]}>{MENTOR_STATUS[m.status]}</Badge></div>
                </li>))}
            </ul>)}
        </Card>

        <Card title="Start a circle" subtitle="One active mentor, up to five people from the same cohort. A circle with anyone under 18 needs the partner's representative named, and that person must have a guardian's agreement on record.">
          {active.length === 0 || D.cohorts.length === 0 ? <p className="text-sm text-slate-600">{active.length === 0 ? 'You need at least one active mentor first.' : 'There is no confirmed or running cohort yet.'}</p> : (
            <form action={createCircle} className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">Cohort<select name="cohort" required className={inputCls}>{D.cohorts.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="text-xs font-semibold text-slate-600">Mentor<select name="mentor" required className={inputCls}>{active.map((m: any) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select></label>
              <label className="text-xs font-semibold text-slate-600">Circle name<input name="name" required maxLength={80} placeholder="Circle 1" className={inputCls} /></label>
              <label className="text-xs font-semibold text-slate-600">Focus<select name="focus" className={inputCls}>{Object.entries(FOCUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="text-xs font-semibold text-slate-600">Where it meets<input name="place" maxLength={120} className={inputCls} /></label>
              <label className="text-xs font-semibold text-slate-600">First session on<input type="date" name="start_date" className={inputCls} /></label>
              <label className="text-xs font-semibold text-slate-600">Partner representative (needed for under 18s)<input name="rep_name" maxLength={100} className={inputCls} /></label>
              <label className="text-xs font-semibold text-slate-600">Their phone<input name="rep_phone" maxLength={30} className={inputCls} /></label>
              <div className="sm:col-span-2"><button className={submitCls}>Create circle</button></div>
            </form>)}
        </Card>
      </div>

      <Card className="mt-6" title="Circles">
        {D.circles.length === 0 ? <p className="text-sm text-slate-600">No circles yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-1">Circle</th><th>Cohort</th><th>Mentor</th><th>People</th><th>Sessions</th><th>Last</th><th /></tr></thead>
            <tbody>{D.circles.map((c: any) => (
              <tr key={c.id} className="border-t border-teal-50"><td className="py-2"><Link href={`/portal/circles/${c.id}`} className="font-bold text-teal underline">{c.name}</Link>{c.has_minors && <span className="ml-2"><Badge tone="gold">Includes under 18s</Badge></span>}</td>
                <td>{c.cohort_name}</td><td>{c.mentor_name}</td><td>{c.members}</td><td>{c.held}</td><td>{c.last_held ? d(c.last_held) : '—'}</td><td><Badge tone={c.status === 'active' ? 'green' : 'grey'}>{c.status}</Badge></td></tr>))}</tbody>
          </table></div>)}
      </Card>

      <Card className="mt-6" title="What the sessions are telling us" subtitle="Totals only, and only once at least three people have answered. You never see an individual's answer.">
        {fb.hidden ? <p className="text-sm text-slate-600">{fb.n} answer{fb.n === 1 ? '' : 's'} so far. Totals appear at three.</p> : (
          <div className="grid gap-6 md:grid-cols-3">
            <div><div className="text-xs font-bold uppercase text-slate-500">Usefulness (1 to 5)</div><div className="text-3xl font-bold text-teal">{fb.usefulness}</div>
              <div className="mt-3 text-xs font-bold uppercase text-slate-500">Next step is clear (1 to 5)</div><div className="text-3xl font-bold text-teal">{fb.next_step_clear}</div>
              <div className="mt-2 text-xs text-slate-500">{fb.n} answers from {D.sum.attendance ?? '—'}% attendance</div></div>
            <div className="space-y-1.5"><div className="text-xs font-bold uppercase text-slate-500">Pace</div>
              {Object.entries(T.paceOpts).map(([k, l]) => <Bar key={k} label={l} n={fb.pace[k] ?? 0} total={fb.n} />)}
              <div className="pt-2 text-xs font-bold uppercase text-slate-500">Commitments kept</div><Bar label="Done" n={D.sum.commitments.done} total={D.sum.commitments.total} /></div>
            <div className="space-y-1.5"><div className="text-xs font-bold uppercase text-slate-500">What would help</div>
              {Object.entries(fb.improve as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([k, n]) => <Bar key={k} label={T.improveOpts[k] ?? k} n={n} total={fb.n} />)}</div>
          </div>)}
      </Card>
    </>
  );
}
