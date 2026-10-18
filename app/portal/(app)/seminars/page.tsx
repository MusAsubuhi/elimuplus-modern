import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Stat, Table, inputCls, submitCls } from '@/components/ui';
import { FEEDBACK_SCALES, FEEDBACK_TEXT, HOST_FIELDS } from '@/lib/seminar';
import { createSeminar, saveHostReport, setSeminarStatus } from '../../seminar-actions';

export const dynamic = 'force-dynamic';
const day = (x: any) => new Date(x).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const avg = (rows: any[], k: string) => { const v = rows.map((r) => Number(r.answers?.[k])).filter((n) => n > 0); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '–'; };

export default async function Seminars() {
  const me = await requireMe('founder', 'master');
  const { seminars, entries } = await asUser(me.id, async (q) => ({
    seminars: await q('select * from seminars order by held_on desc limit 24'),
    entries: await q('select seminar_id, kind, name, phone, email, group_label, newsletter_consent, answers, created_at from seminar_entries order by created_at'),
  }));
  const base = (process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.elimuplus.com').replace(/\/$/, '');
  return (
    <>
      <PageHeader title="Monthly seminars" subtitle="Create a seminar, share its sign-in and feedback links, then record the host report once the day is over." />
      <Card title="New seminar" className="mb-6">
        <form action={createSeminar} className="grid gap-3 sm:grid-cols-4">
          <input name="title" required placeholder="Title, e.g. October participants' forum" className={`${inputCls} sm:col-span-2`} />
          <input name="held_on" type="date" required defaultValue="2026-10-28" className={inputCls} />
          <input name="venue" placeholder="Venue" className={inputCls} />
          <div className="sm:col-span-4"><button className={submitCls}>Create seminar</button></div>
        </form>
      </Card>
      {seminars.length === 0 && <p className="text-sm text-slate-500">No seminars yet.</p>}
      {seminars.map((s: any) => {
        const mine = entries.filter((e: any) => e.seminar_id === s.id);
        const sign = mine.filter((e: any) => e.kind === 'signin'), fb = mine.filter((e: any) => e.kind === 'feedback');
        const links = [['Sign-in', `${base}/seminar/${s.code}`], ['Feedback', `${base}/seminar/${s.code}/feedback`]];
        const hr = s.host_report ?? {};
        return (
          <Card key={s.id} className="mb-6" title={s.title} subtitle={`${day(s.held_on)}${s.venue ? ` · ${s.venue}` : ''}`}
            action={<form action={setSeminarStatus}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="status" value={s.status === 'open' ? 'closed' : 'open'} /><button className="text-xs font-bold text-teal underline">{s.status === 'open' ? 'Close sign-in' : 'Reopen sign-in'}</button></form>}>
            <div className="mb-4 grid gap-3 sm:grid-cols-4">
              <Stat label="Signed in" value={sign.length} />
              <Stat tone="gold" label="Feedback forms" value={fb.length} />
              <Stat label="Average usefulness" value={avg(fb, 'useful')} sub="out of 5" />
              <Stat tone="green" label="Newsletter yes" value={sign.filter((e: any) => e.newsletter_consent).length} />
            </div>
            <p className="mb-1 text-sm"><Badge tone={s.status === 'open' ? 'green' : 'grey'}>{s.status}</Badge></p>
            <ul className="mb-4 space-y-1 text-sm">{links.map(([l, u]) => <li key={u}><b>{l} link:</b> <a className="break-all text-teal underline" href={u} target="_blank" rel="noreferrer">{u}</a></li>)}</ul>
            <h3 className="mb-2 font-bold text-teal">Attendance</h3>
            <Table head={['Name', 'Phone', 'Group', 'Email', 'Newsletter']} empty="Nobody has signed in yet."
              rows={sign.map((e: any) => [e.name, e.phone, e.group_label ?? '', e.email ?? '', e.newsletter_consent ? 'Yes' : ''])} />
            {fb.length > 0 && (
              <>
                <h3 className="mb-2 mt-5 font-bold text-teal">Feedback</h3>
                <p className="mb-2 text-sm">{FEEDBACK_SCALES.map((c) => `${c.label.replace(/\?$/, '')}: ${avg(fb, c.key)}`).join(' · ')}</p>
                <p className="mb-2 text-sm">Would come again: yes {fb.filter((e: any) => e.answers.again === 'yes').length}, maybe {fb.filter((e: any) => e.answers.again === 'maybe').length}, no {fb.filter((e: any) => e.answers.again === 'no').length}</p>
                {FEEDBACK_TEXT.map((t) => (
                  <div key={t.key} className="mb-2"><p className="text-sm font-bold">{t.label}</p>
                    <ul className="list-disc pl-5 text-sm">{fb.filter((e: any) => e.answers[t.key]).map((e: any, i: number) => <li key={i}>{e.answers[t.key]}{e.name ? <span className="text-slate-500"> ({e.name})</span> : null}</li>)}</ul></div>
                ))}
              </>
            )}
            <h3 className="mb-2 mt-5 font-bold text-teal">Host report {s.host_report_at ? <span className="text-xs font-normal text-slate-500">saved {day(s.host_report_at)}</span> : null}</h3>
            <form action={saveHostReport} className="space-y-3">
              <input type="hidden" name="id" value={s.id} />
              {HOST_FIELDS.map((h) => (
                <div key={h.key}><label className="mb-1 block text-sm font-bold" htmlFor={`${s.id}-${h.key}`}>{h.label}</label>
                  {h.long ? <textarea id={`${s.id}-${h.key}`} name={h.key} rows={3} defaultValue={hr[h.key] ?? ''} className={inputCls} /> : <input id={`${s.id}-${h.key}`} name={h.key} defaultValue={hr[h.key] ?? ''} className={inputCls} />}</div>
              ))}
              <button className={submitCls}>Save host report</button>
            </form>
          </Card>
        );
      })}
    </>
  );
}
