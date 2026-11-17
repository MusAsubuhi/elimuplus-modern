import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { asUser } from '@/lib/db';
import { getLang, requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, inputCls, submitCls } from '@/components/ui';
import SessionFeedbackForm from '@/components/session-feedback-form';
import { FOCUS, FORM } from '@/lib/mentoring';
import { d } from '@/lib/format';
import { todayNairobi } from '@/lib/book';
import { addMeeting, addMember, cancelMeeting, recordMeeting, removeMember, tickCommitment, updateCircle } from '../../../mentoring-actions';

export const dynamic = 'force-dynamic';

export default async function CirclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const lang = await getLang(me);
  const D = await asUser(me.id, async (q) => {
    const c = (await q('select * from app.circles_visible() where id=$1', [id]))[0];
    if (!c) return null;
    return {
      c,
      roster: await q('select * from app.circle_roster($1)', [id]),
      meetings: await q('select * from circle_meetings where circle_id=$1 order by held_on desc, created_at desc', [id]),
      notes: await q('select n.* from circle_meeting_notes n join circle_meetings m on m.id=n.meeting_id where m.circle_id=$1', [id]),
      att: await q('select a.* from circle_attendance a join circle_meetings m on m.id=a.meeting_id where m.circle_id=$1', [id]),
      commits: await q('select * from circle_commitments where circle_id=$1 order by created_at desc', [id]),
      mine: await q('select meeting_id from mentoring_feedback where circle_id=$1 and person_id=$2', [id, me.id]),
      totals: (await q('select app.circle_feedback($1) r', [id]).catch(() => [{ r: null }]))[0].r as any,
      eligible: await q(`select p.id, p.full_name from enrolments e join people p on p.id=e.person_id where e.cohort_id=$1 and e.status<>'dropped'
          and p.id not in (select person_id from circle_members where circle_id=$2 and status='active') and p.id <> coalesce($3::uuid, p.id) order by p.full_name`, [c.cohort_id, id, c.mentor_person]),
    };
  });
  // A partner's own contact reaches the circle list, not the people inside it.
  if (!D) redirect('/portal/circles');
  const { c } = D;
  const isFounder = me.roles.includes('founder');
  const isMentor = c.mentor_person === me.id;
  if (!isFounder && !isMentor && !D.roster.some((r: any) => r.person_id === me.id)) redirect('/portal/circles');
  const manage = isFounder || isMentor;
  const people = D.roster.filter((r: any) => r.role === 'mentee');
  const nameOf = (pid: string) => D.roster.find((r: any) => r.person_id === pid)?.name ?? '';
  const answered = new Set(D.mine.map((r: any) => r.meeting_id));
  const today = todayNairobi();
  const t = FORM[lang];
  const fb = D.totals;
  const canAnswer = (m: any) => m.status === 'held' && !answered.has(m.id) && (isMentor || people.some((p: any) => p.person_id === me.id));
  const openFeedback = D.meetings.filter(canAnswer);
  const myCommits = D.commits.filter((x: any) => x.person_id === me.id);

  return (
    <>
      <PageHeader title={c.name} subtitle={`${c.cohort_name} · ${FOCUS[c.focus]} · mentor ${c.mentor_name}${c.place ? ` · ${c.place}` : ''}`}>
        <Badge tone={c.status === 'active' ? 'green' : 'grey'}>{c.status}</Badge>
        {c.has_minors && <Badge tone="gold">Includes people under 18</Badge>}
      </PageHeader>
      <p className="mb-4 text-sm"><Link href={isFounder ? '/portal/mentoring' : '/portal/circles'} className="font-bold text-teal underline">← {isFounder ? 'Mentoring' : 'My circles'}</Link></p>

      {c.has_minors && (
        <p className="mb-4 rounded-lg bg-gold-100 px-4 py-3 text-sm text-teal"><b>Safeguarding.</b> This circle includes someone under 18. Meet in the open or with {c.partner_rep_name ? <b>{c.partner_rep_name}</b> : 'the partner representative'}{c.partner_rep_phone ? ` (${c.partner_rep_phone})` : ''} present, never alone with one young person, and tell a founder the same day about anything that worries you.</p>)}

      {openFeedback.length > 0 && (
        <Card className="mb-6 border-gold" title={t.title} subtitle={`${d(openFeedback[0].held_on)}${openFeedback[0].topic ? ' · ' + openFeedback[0].topic : ''}`}>
          <SessionFeedbackForm meeting={openFeedback[0].id} lang={lang} mentor={isMentor} />
        </Card>)}

      {myCommits.length > 0 && !isMentor && (
        <Card className="mb-6" title={lang === 'sw' ? 'Ahadi zangu' : 'My commitments'} subtitle={lang === 'sw' ? 'Ulichoahidi kufanya kabla ya kikao kijacho.' : 'What you said you would do before the next session.'}>
          <ul className="space-y-2">{myCommits.map((x: any) => (
            <li key={x.id} className="flex items-center justify-between gap-3 rounded-lg bg-mist p-3 text-sm">
              <span className={x.done ? 'text-slate-400 line-through' : 'font-semibold text-ink'}>{x.text}{x.due_on ? <span className="ml-2 text-xs font-normal text-slate-500">{d(x.due_on)}</span> : null}</span>
              <form action={tickCommitment}><input type="hidden" name="id" value={x.id} /><button className={`rounded-lg px-3 py-1.5 text-xs font-bold ${x.done ? 'border border-slate-300 text-slate-600' : 'bg-teal text-white'}`}>{x.done ? (lang === 'sw' ? 'Rudisha' : 'Undo') : (lang === 'sw' ? 'Nimefanya' : 'Done')}</button></form>
            </li>))}</ul>
        </Card>)}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1" title="The circle" subtitle={manage ? 'Full names are visible to the mentor and founders only.' : 'First names only.'}>
          <ul className="space-y-1 text-sm">
            {D.roster.map((r: any) => (
              <li key={r.person_id + r.role} className="flex items-center justify-between gap-2"><span><b>{r.name}</b> {r.role === 'mentor' && <Badge tone="teal">Mentor</Badge>}</span>
                {isFounder && r.role === 'mentee' && <form action={removeMember}><input type="hidden" name="id" value={id} /><input type="hidden" name="person" value={r.person_id} /><button className="text-xs font-bold text-red-700 underline">Remove</button></form>}</li>))}
          </ul>
          {isFounder && (
            <form action={addMember} className="mt-4 flex gap-2 border-t border-teal-50 pt-3">
              <input type="hidden" name="id" value={id} />
              <select name="person" required className={inputCls}><option value="">Add someone from the cohort…</option>{D.eligible.map((p: any) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
              <button className={submitCls}>Add</button></form>)}
          {isFounder && (
            <form action={updateCircle} className="mt-4 grid gap-2 border-t border-teal-50 pt-3 text-xs font-semibold text-slate-600">
              <input type="hidden" name="id" value={id} />
              <label>Partner representative<input name="rep_name" defaultValue={c.partner_rep_name ?? ''} className={inputCls} /></label>
              <label>Their phone<input name="rep_phone" defaultValue={c.partner_rep_phone ?? ''} className={inputCls} /></label>
              <label>Status<select name="status" defaultValue={c.status} className={inputCls}><option value="planned">Planned</option><option value="active">Active</option><option value="closed">Closed</option></select></label>
              <button className={submitCls}>Save circle</button></form>)}
        </Card>

        <div className="space-y-6 lg:col-span-2">
          {manage && c.status !== 'closed' && (
            <Card title="Plan a session">
              <form action={addMeeting} className="grid gap-3 sm:grid-cols-4">
                <input type="hidden" name="id" value={id} />
                <label className="text-xs font-semibold text-slate-600">Date<input type="date" name="held_on" required defaultValue={today} className={inputCls} /></label>
                <label className="text-xs font-semibold text-slate-600">Minutes<input type="number" name="minutes" defaultValue={60} min={15} max={480} className={inputCls} /></label>
                <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Topic<input name="topic" maxLength={160} placeholder="Pricing our first product" className={inputCls} /></label>
                <label className="text-xs font-semibold text-slate-600 sm:col-span-3">Place<input name="place" defaultValue={c.place ?? ''} maxLength={120} className={inputCls} /></label>
                <div className="flex items-end"><button className={submitCls}>Add session</button></div>
              </form>
            </Card>)}

          {manage && D.meetings.filter((m: any) => m.status === 'planned' && m.held_on <= today).map((m: any) => (
            <Card key={m.id} title={`Record the session of ${d(m.held_on)}`} subtitle={m.topic ?? undefined}>
              <form action={recordMeeting} className="space-y-3">
                <input type="hidden" name="meeting" value={m.id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-xs font-semibold text-slate-600">Minutes<input type="number" name="minutes" defaultValue={m.minutes} min={15} max={480} className={inputCls} /></label>
                  <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Topic<input name="topic" defaultValue={m.topic ?? ''} maxLength={160} className={inputCls} /></label>
                </div>
                <div className="rounded-lg border border-teal-100 p-3">
                  <div className="mb-2 text-xs font-bold uppercase text-slate-500">Who came, and what each person will do before next time</div>
                  <div className="space-y-2">{people.map((p: any) => (
                    <div key={p.person_id} className="grid items-center gap-2 sm:grid-cols-[170px_1fr]">
                      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name={`came_${p.person_id}`} defaultChecked /> {p.name}</label>
                      <input name={`commit_${p.person_id}`} maxLength={300} placeholder="One small thing they will do (optional)" className={inputCls} /></div>))}</div>
                  <label className="mt-2 block text-xs font-semibold text-slate-600">Commitments due on<input type="date" name="due_on" className={`${inputCls} max-w-44`} /></label>
                </div>
                <label className="block text-xs font-semibold text-slate-600">Your private notes (mentor and founders only; mentees never see them)<textarea name="notes" rows={3} maxLength={2000} className={inputCls} /></label>
                <label className="flex items-center gap-2 text-sm font-semibold text-red-700"><input type="checkbox" name="concern" /> Something worries me and a founder should know</label>
                <div className="flex gap-2"><button className={submitCls}>Save session</button></div>
              </form>
              <form action={cancelMeeting} className="mt-2"><input type="hidden" name="meeting" value={m.id} /><button className="text-xs font-bold text-slate-600 underline">The session did not happen</button></form>
            </Card>))}

          <Card title="Sessions">
            {D.meetings.length === 0 ? <p className="text-sm text-slate-600">No sessions yet.</p> : (
              <ul className="space-y-2 text-sm">{D.meetings.map((m: any) => {
                const came = D.att.filter((a: any) => a.meeting_id === m.id && a.attended).length;
                const note = D.notes.find((n: any) => n.meeting_id === m.id);
                return (
                  <li key={m.id} className="rounded-lg bg-mist p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold text-teal">{d(m.held_on)}{m.topic ? ` · ${m.topic}` : ''}</span>
                      <span className="flex items-center gap-2 text-xs text-slate-500">{m.status === 'held' && manage && `${came} of ${people.length} came · `}{m.minutes} min<Badge tone={m.status === 'held' ? 'green' : m.status === 'planned' ? 'blue' : 'grey'}>{m.status}</Badge></span></div>
                    {manage && note?.concern && <p className="mt-1 text-xs font-bold text-red-700">Mentor raised a concern.</p>}
                    {manage && note?.notes && <p className="mt-1 whitespace-pre-line text-xs text-slate-600"><b>Private notes:</b> {note.notes}</p>}
                    {m.status === 'held' && D.commits.filter((x: any) => x.meeting_id === m.id && (manage || x.person_id === me.id)).map((x: any) => (
                      <p key={x.id} className="mt-1 text-xs text-slate-700">{manage ? `${nameOf(x.person_id)}: ` : ''}{x.text} {x.done ? <Badge tone="green">done</Badge> : <Badge tone="grey">open</Badge>}</p>))}
                  </li>);
              })}</ul>)}
          </Card>

          {manage && (
            <Card title="How the sessions are going" subtitle="Totals from the people in the circle, shown once at least three have answered. You never see who said what.">
              {!fb || fb.hidden ? <p className="text-sm text-slate-600">{fb?.n ?? 0} answer{fb?.n === 1 ? '' : 's'} so far. Totals appear at three.</p> : (
                <div className="grid gap-4 sm:grid-cols-3 text-sm">
                  <div><div className="text-xs font-bold uppercase text-slate-500">Useful</div><div className="text-2xl font-bold text-teal">{fb.usefulness}<span className="text-xs font-normal text-slate-500"> / 5</span></div></div>
                  <div><div className="text-xs font-bold uppercase text-slate-500">Next step clear</div><div className="text-2xl font-bold text-teal">{fb.next_step_clear}<span className="text-xs font-normal text-slate-500"> / 5</span></div></div>
                  <div><div className="text-xs font-bold uppercase text-slate-500">Pace</div><div className="text-xs text-slate-700">{FORM.en.paceOpts.too_slow}: {fb.pace.too_slow} · {FORM.en.paceOpts.right}: {fb.pace.right} · {FORM.en.paceOpts.too_fast}: {fb.pace.too_fast}</div></div>
                  <div className="sm:col-span-3"><div className="text-xs font-bold uppercase text-slate-500">What would help most</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">{Object.entries(fb.improve as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([k, n]) => <span key={k} className="rounded-full bg-gold-100 px-3 py-1 text-xs font-semibold text-teal">{FORM.en.improveOpts[k] ?? k} · {n}</span>)}</div></div>
                </div>)}
            </Card>)}
        </div>
      </div>
    </>
  );
}
