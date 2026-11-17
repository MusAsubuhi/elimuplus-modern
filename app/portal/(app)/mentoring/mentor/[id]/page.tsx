import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asUser } from '@/lib/db';
import { requireFeature } from '@/lib/access';
import { audit } from '@/lib/audit';
import { Badge, Card, PageHeader, inputCls, submitCls } from '@/components/ui';
import { ActivateMentorForm } from '@/components/mentoring-forms';
import { MENTOR_STATUS, MENTOR_TONE } from '@/lib/mentoring';
import { d } from '@/lib/format';
import { decideMentor, saveVetting } from '../../../../mentoring-actions';

export const dynamic = 'force-dynamic';

export default async function MentorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireFeature('mentoring');
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const m = (await asUser(me.id, (q) => q('select * from mentors where id=$1', [id])))[0];
  if (!m) notFound();
  await audit(me.id, 'view mentor vetting', 'mentors');
  const circles = await asUser(me.id, (q) => q("select c.id, c.name, c.status, co.name cohort_name from mentoring_circles c join cohorts co on co.id=c.cohort_id where c.mentor_id=$1 order by c.created_at desc", [id]));
  const steps = [
    { key: 'interview_on', label: 'Had a conversation with them', hint: 'Do they listen? Can they talk with a young person and with a parent without lecturing?' },
    { key: 'referee_on', label: 'Called their referee', hint: m.referee_name ? `${m.referee_name}${m.referee_phone ? ', ' + m.referee_phone : ''}` : 'No referee was given. Ask for one.' },
    { key: 'briefing_on', label: 'Briefed on safeguarding and boundaries', hint: 'Meet in the open or with the partner present, never alone with someone under 18, no money lent or gifts, concerns raised with a founder the same day.' },
    { key: 'agreement_on', label: 'Signed the mentor agreement', hint: 'Confidentiality, conduct, and that Elimu+ can end the arrangement at any time.' },
  ] as const;
  const done = steps.filter((s) => m[s.key]).length;
  const editable = m.status === 'vetting' || m.status === 'paused';
  return (
    <>
      <PageHeader title={m.full_name} subtitle="Application and vetting. A sign-in is created only when you pass them, after all four steps carry a date.">
        <Badge tone={MENTOR_TONE[m.status]}>{MENTOR_STATUS[m.status]}</Badge>
      </PageHeader>
      <p className="mb-4 text-sm"><Link href="/portal/mentoring" className="font-bold text-teal underline">← Mentoring</Link></p>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Their application">
          <dl className="space-y-2 text-sm">
            {([['Phone', m.phone], ['Email', m.email], ['Lives in', m.county], ['What they do', m.occupation], ['Would mentor', m.serves === 'both' ? 'Youth and caregivers' : m.serves === 'youth' ? 'Youth' : 'Caregivers'], ['Languages', (m.languages ?? []).join(', ')], ['Hours a month', m.hours_per_month], ['Background', m.background], ['Why they want to mentor', m.motivation], ['Referee', [m.referee_name, m.referee_phone].filter(Boolean).join(', ')], ['Applied', d(m.created_at)]] as [string, any][]).filter(([, v]) => v).map(([k, v]) => (
              <div key={k}><dt className="text-xs font-semibold text-slate-500">{k}</dt><dd className="whitespace-pre-line text-slate-800">{v}</dd></div>))}
          </dl>
          {circles.length > 0 && <div className="mt-4 border-t border-teal-50 pt-3 text-sm"><div className="mb-1 text-xs font-semibold text-slate-500">Circles</div>
            {circles.map((c: any) => <div key={c.id}><Link href={`/portal/circles/${c.id}`} className="font-bold text-teal underline">{c.name}</Link> <span className="text-xs text-slate-500">{c.cohort_name} · {c.status}</span></div>)}</div>}
        </Card>

        <Card title={`Vetting, ${done} of 4 steps`} subtitle="Record the date each step happened. Your note is private to founders.">
          <form action={saveVetting} className="space-y-3">
            <input type="hidden" name="id" value={m.id} />
            {steps.map((s) => (
              <label key={s.key} className="block text-sm font-semibold text-slate-700">{s.label}
                <input type="date" name={s.key} defaultValue={m[s.key] ? String(m[s.key]).slice(0, 10) : ''} disabled={!editable} className={inputCls} />
                <span className="block text-xs font-normal text-slate-500">{s.hint}</span></label>))}
            <label className="block text-sm font-semibold text-slate-700">Phone (their sign-in)<input name="phone" defaultValue={m.phone ?? ''} disabled={!editable} className={inputCls} placeholder="0712 345 678" /></label>
            <label className="block text-sm font-semibold text-slate-700">Private note<textarea name="note" rows={3} defaultValue={m.vetting_note ?? ''} disabled={!editable} className={inputCls} /></label>
            {editable && <button className={submitCls}>Save vetting</button>}
          </form>
        </Card>
      </div>

      <Card className="mt-6" title="Decision">
        {m.status === 'active' ? <p className="mb-3 text-sm text-slate-600">Active since {d(m.activated_at)}. To reset a PIN, use Reset PIN on the Team page.</p>
          : editable ? <ActivateMentorForm id={m.id} ready={done === 4} /> : <p className="text-sm text-slate-600">This application is closed.</p>}
        <form action={decideMentor} className="mt-4 flex flex-wrap items-end gap-2 border-t border-teal-50 pt-4">
          <input type="hidden" name="id" value={m.id} />
          <label className="min-w-60 flex-1 text-xs font-semibold text-slate-600">Reason (kept private)<input name="note" className={inputCls} /></label>
          {m.status !== 'active' && m.status !== 'declined' && <button name="to" value="declined" className="rounded-lg border border-red-300 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50">Not going ahead</button>}
          {m.status === 'active' && <button name="to" value="paused" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Pause</button>}
          {m.status === 'active' && <button name="to" value="ended" className="rounded-lg border border-red-300 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50">End</button>}
          {(m.status === 'paused' || m.status === 'declined') && <button name="to" value="vetting" className="rounded-lg border border-teal px-3 py-2 text-sm font-bold text-teal hover:bg-teal-50">Back to vetting</button>}
        </form>
        <p className="mt-2 text-xs text-slate-500">Pausing or ending a mentor stops their access to circles at once and moves their circles back to planned. Nothing is deleted.</p>
      </Card>
    </>
  );
}
