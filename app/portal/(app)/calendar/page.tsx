import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireFeature } from '@/lib/access';
import { Badge, Card, PageHeader, Stat, inputCls, submitCls } from '@/components/ui';
import { d, todayEAT } from '@/lib/format';
import { loadCalendar } from '@/lib/calendar';
import {
  addDays, isActive, isTentative, monthStart, monthWeeks, pairKey, shiftMonth, worstLevel,
  type Clash, type ClashLevel, type Training,
} from '@/lib/calendar-core';
import { confirmClash, makeFeed, removeFeed, withdrawClash } from '../../calendar-actions';

export const dynamic = 'force-dynamic';

const ghost = 'rounded-lg border border-teal px-3 py-1.5 text-xs font-bold text-teal hover:bg-teal-50';
const MONTH = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAYNUM = (iso: string) => Number(iso.slice(8, 10));
const STATUS_LABEL: Record<string, string> = { requested: 'Requested', quoted: 'Quoted', confirmed: 'Confirmed', delivering: 'Running now', followup: 'Follow-up stage', closed: 'Closed' };

/** Colour is never the only signal: tentative bars are dashed and every warning carries a symbol and a word. */
const chipCls = (s: string) =>
  s === 'requested' ? 'border border-dashed border-slate-400 bg-white text-slate-700'
  : s === 'quoted' ? 'border border-dashed border-gold bg-gold-100 text-gold-600'
  : s === 'confirmed' ? 'bg-teal text-white'
  : s === 'delivering' ? 'bg-emerald-700 text-white'
  : 'bg-slate-200 text-slate-600';
const MARK: Record<ClashLevel, string> = { conflict: '✖', check: '⚠', confirmed: '✓' };
const MARK_WORD: Record<ClashLevel, string> = { conflict: 'trainer clash', check: 'overlaps another training, to confirm', confirmed: 'overlap confirmed' };
const LEVEL_TONE: Record<ClashLevel, string> = { conflict: 'red', check: 'gold', confirmed: 'green' };
const LEVEL_LABEL: Record<ClashLevel, string> = { conflict: 'Trainer clash', check: 'To confirm', confirmed: 'Confirmed' };

type SP = { m?: string; view?: string; who?: string; st?: string; mine?: string; ok?: string; err?: string };

export default async function TrainingCalendar({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireFeature('calendar');
  const founder = me.roles.includes('founder');
  const sp = await searchParams;
  const today = todayEAT();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m ?? '') ? `${sp.m}-01` : monthStart(today);
  const view = sp.view === 'list' ? 'list' : 'month';
  const showAll = sp.st === 'all';
  const who = /^[0-9a-f-]{36}$/.test(sp.who ?? '') ? sp.who! : '';
  const mineOnly = sp.mine === '1';

  const [{ trainings, clashes }, feed] = await Promise.all([
    asUser(me.id, (q) => loadCalendar(q, { founder })),
    asUser(me.id, (q) => q('select token, created_at, last_read_at from calendar_feeds where person_id=$1', [me.id])),
  ]);

  // The overlaps panel looks at every training the person can see, whatever the filters; the filters shape only what is drawn.
  const trainers = new Map<string, string>();
  for (const t of trainings) for (const x of t.trainers) trainers.set(x.id, x.name);
  const visible = trainings.filter((t) =>
    (showAll || isActive(t.status) || t.status === 'followup' && (t.end ?? '') >= addDays(today, -14)) &&
    (!who || t.trainers.some((x) => x.id === who)) &&
    (!mineOnly || t.trainers.some((x) => x.id === me.id)));
  const scheduled = visible.filter((t) => t.days.length);
  const unscheduled = visible.filter((t) => !t.days.length && isActive(t.status));

  // each overlapping pair once, from the trainings still ahead of us
  const pairs: { a: Training; b: Training; c: Clash }[] = [];
  const seen = new Set<string>();
  const byId = new Map(trainings.map((t) => [t.id, t]));
  for (const [id, list] of clashes) for (const c of list) {
    const k = pairKey(id, c.otherId).join('|');
    if (seen.has(k)) continue; seen.add(k);
    const a = byId.get(id)!, b = byId.get(c.otherId)!;
    if (c.days[c.days.length - 1] < today) continue;
    pairs.push({ a, b, c });
  }
  pairs.sort((x, y) => x.c.days[0].localeCompare(y.c.days[0]));
  const open = pairs.filter((p) => p.c.level !== 'confirmed');
  const done = pairs.filter((p) => p.c.level === 'confirmed');

  const href = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged: SP = { m: month.slice(0, 7), view, who, st: showAll ? 'all' : '', mine: mineOnly ? '1' : '', ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    return `/portal/calendar?${p.toString()}`;
  };
  const returnTo = href({});

  const weeks = monthWeeks(month);
  const monthEnd = addDays(shiftMonth(month, 1), -1);
  const inMonth = scheduled.filter((t) => t.days.some((x) => x >= month && x <= monthEnd));
  const horizon = addDays(today, 90);
  const ahead = scheduled.filter((t) => (t.end ?? '') >= today && (t.start ?? '') <= horizon);
  const cards = view === 'list' ? ahead : inMonth;

  const base = (process.env.PORTAL_URL || 'https://portal.elimuplus.com').replace(/\/$/, '');
  const feedUrl = feed[0] ? `${base}/cal/${feed[0].token}.ics` : null;

  const chip = (t: Training, date: string) => {
    const w = worstLevel(clashes.get(t.id));
    const n = t.days.indexOf(date) + 1;
    return (
      <a key={t.id} href={`#t-${t.id}`} title={`${t.name}, ${t.org}, day ${n} of ${t.days.length}${w ? `, ${MARK_WORD[w]}` : ''}`}
        className={`block truncate rounded px-1.5 py-0.5 text-[11px] font-semibold leading-tight ${chipCls(t.status)} ${w === 'conflict' ? 'ring-2 ring-red-600' : w === 'check' ? 'ring-2 ring-gold' : ''}`}>
        {w ? `${MARK[w]} ` : ''}{t.name}
      </a>
    );
  };

  return (
    <>
      <PageHeader image="/images/home-facilitator.jpg" title="Training calendar"
        subtitle={founder ? 'Every training across Elimu+: when it runs, who delivers it, and where trainings overlap.' : 'The trainings you deliver, day by day, and where they overlap.'}>
        <Link href={href({ view: 'month' })} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${view === 'month' ? 'bg-white text-teal' : 'border border-white/70 text-white'}`}>Month</Link>
        <Link href={href({ view: 'list' })} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${view === 'list' ? 'bg-white text-teal' : 'border border-white/70 text-white'}`}>Next 90 days</Link>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Trainings shown" value={visible.length} sub={`${scheduled.length} with dates`} />
        <Stat tone={open.some((p) => p.c.level === 'conflict') ? 'red' : 'green'} label="Trainer clashes" value={open.filter((p) => p.c.level === 'conflict').length} sub="a trainer on two at once" />
        <Stat tone={open.some((p) => p.c.level === 'check') ? 'gold' : 'green'} label="Overlaps to confirm" value={open.filter((p) => p.c.level === 'check').length} sub="different trainers, to check" />
        <Stat tone="gold" label="No dates yet" value={unscheduled.length} />
      </div>

      {(open.length > 0 || done.length > 0) && (
        <Card className="mb-6" title="Overlapping trainings" subtitle="Two trainings can run on the same days, but each needs its own trainer. A founder confirms the pair once the trainers and the venue are checked.">
          <ul className="space-y-3">
            {open.map(({ a, b, c }) => (
              <li key={a.id + b.id} className={`rounded-lg border p-3 text-sm ${c.level === 'conflict' ? 'border-red-300 bg-red-50' : 'border-gold bg-[#FFF8E6]'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b className="text-teal">{a.name} <span className="font-normal text-slate-500">and</span> {b.name}</b>
                  <Badge tone={LEVEL_TONE[c.level]}>{MARK[c.level]} {LEVEL_LABEL[c.level]}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {c.days.length === 1 ? d(c.days[0]) : `${d(c.days[0])} to ${d(c.days[c.days.length - 1])}`} ({c.days.length} {c.days.length === 1 ? 'day' : 'days'} together)
                  {' · '}{a.org}{a.org !== b.org ? ` and ${b.org}` : ''}
                </p>
                <ul className="mt-2 list-disc pl-5 text-slate-700">{c.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                <p className="mt-2 text-xs text-slate-600">
                  <b>{a.name}:</b> {a.trainers.length ? a.trainers.map((x) => x.name).join(', ') : 'no trainer yet'}
                  {' · '}<b>{b.name}:</b> {b.trainers.length ? b.trainers.map((x) => x.name).join(', ') : 'no trainer yet'}
                </p>
                {founder && c.canConfirm && (
                  <form action={confirmClash} className="mt-3 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="a" value={a.id} /><input type="hidden" name="b" value={b.id} /><input type="hidden" name="return" value={returnTo} />
                    <input name="note" maxLength={500} placeholder="What you checked, for example: both trainers confirmed by phone" className={`${inputCls} max-w-md flex-1`} />
                    <button className={submitCls}>Confirm: different trainers cover each</button>
                  </form>
                )}
                {founder && !c.canConfirm && <p className="mt-2 text-xs font-semibold text-red-700">This cannot be confirmed yet. Fix the trainers on the cohort pages first.</p>}
                {!founder && <p className="mt-2 text-xs text-slate-500">A founder confirms overlaps. Tell them if your availability changes.</p>}
              </li>
            ))}
            {!open.length && <li className="text-sm text-slate-600">Nothing waiting. Every overlap ahead has been confirmed.</li>}
          </ul>
          {done.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-bold text-teal">Confirmed overlaps ({done.length})</summary>
              <ul className="mt-2 space-y-2 text-sm">
                {done.map(({ a, b, c }) => (
                  <li key={a.id + b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-100 p-2">
                    <span><b className="text-teal">{a.name}</b> and <b className="text-teal">{b.name}</b>{c.confirmedBy ? ` · confirmed by ${String(c.confirmedBy).split(' ')[0]}` : ''}{c.confirmedAt ? ` on ${d(c.confirmedAt)}` : ''}{c.note ? ` · ${c.note}` : ''}</span>
                    {founder && (
                      <form action={withdrawClash}><input type="hidden" name="a" value={a.id} /><input type="hidden" name="b" value={b.id} /><input type="hidden" name="return" value={returnTo} /><button className={ghost}>Withdraw</button></form>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      )}

      <form action="/portal/calendar" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-teal-100 bg-white p-3 text-sm">
        <input type="hidden" name="view" value={view} /><input type="hidden" name="m" value={month.slice(0, 7)} />
        {trainers.size > 1 && (
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Trainer</span>
            <select name="who" defaultValue={who} className={inputCls}><option value="">Everyone</option>
              {[...trainers].sort((x, y) => x[1].localeCompare(y[1])).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>
        )}
        <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Show</span>
          <select name="st" defaultValue={showAll ? 'all' : ''} className={inputCls}><option value="">Current and upcoming</option><option value="all">Everything, including finished</option></select></label>
        <label className="flex items-center gap-2 pb-2"><input type="checkbox" name="mine" value="1" defaultChecked={mineOnly} className="h-4 w-4" /><span className="text-xs font-semibold text-slate-600">Only my trainings</span></label>
        <button className={submitCls}>Apply</button>
        {(who || mineOnly || showAll) && <Link href={href({ who: '', mine: '', st: '' })} className={ghost}>Clear</Link>}
      </form>

      {view === 'month' && (
        <Card className="mb-6" title={MONTH(month)} action={
          <div className="flex gap-2">
            <Link href={href({ m: shiftMonth(month, -1).slice(0, 7) })} className={ghost} aria-label="Previous month">‹ Previous</Link>
            <Link href={href({ m: monthStart(today).slice(0, 7) })} className={ghost}>Today</Link>
            <Link href={href({ m: shiftMonth(month, 1).slice(0, 7) })} className={ghost} aria-label="Next month">Next ›</Link>
          </div>}>
          <div className="hidden md:block">
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-teal-100 bg-teal-100 text-xs">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((n) => <div key={n} className="bg-teal-50 px-2 py-1 text-center font-bold text-teal">{n}</div>)}
              {weeks.flat().map((date) => {
                const out = date.slice(0, 7) !== month.slice(0, 7);
                const wk = new Date(date + 'T00:00:00Z').getUTCDay();
                const here = scheduled.filter((t) => t.days.includes(date));
                return (
                  <div key={date} className={`min-h-[92px] space-y-1 p-1.5 ${out ? 'bg-slate-50 text-slate-400' : wk === 0 || wk === 6 ? 'bg-[#F5FAF8]' : 'bg-white'} ${date === today ? 'outline outline-2 -outline-offset-2 outline-gold' : ''}`}>
                    <div className={`text-right font-bold ${date === today ? 'text-gold-600' : ''}`}>{DAYNUM(date)}</div>
                    {here.slice(0, 4).map((t) => chip(t, date))}
                    {here.length > 4 && <div className="text-[11px] font-semibold text-slate-500">+{here.length - 4} more</div>}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
              <span><b>Solid teal</b> confirmed</span><span><b>Green</b> running now</span><span><b>Dashed</b> not confirmed yet</span>
              <span>✖ trainer clash</span><span>⚠ overlap to confirm</span><span>✓ overlap confirmed</span>
            </p>
          </div>
          <p className="text-sm text-slate-600 md:hidden">The month grid shows on a wider screen. The trainings for {MONTH(month)} are listed below.</p>
        </Card>
      )}

      <h2 className="mb-3 text-lg font-bold text-teal">{view === 'list' ? 'Trainings in the next 90 days' : `Trainings in ${MONTH(month)}`}</h2>
      <div className="mb-6 space-y-3">
        {cards.map((t) => <TrainingCard key={t.id} t={t} clashes={clashes.get(t.id) ?? []} founder={founder} today={today} />)}
        {!cards.length && <Card>No trainings with dates {view === 'list' ? 'in the next 90 days' : 'this month'}{(who || mineOnly) ? ' for this filter' : ''}.</Card>}
      </div>

      {unscheduled.length > 0 && (
        <Card className="mb-6" title="No dates yet" subtitle="These are on the books but have no start date, so they are not on the calendar.">
          <ul className="space-y-2 text-sm">
            {unscheduled.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/portal/cohorts/${t.id}`} className="font-semibold text-teal underline">{t.name}</Link>
                <span className="text-slate-600">{t.org} · <Badge tone="grey">{STATUS_LABEL[t.status] ?? t.status}</Badge></span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Your phone calendar" subtitle="See these trainings in Google Calendar or the calendar on your phone, kept up to date for you.">
        {feedUrl ? (
          <div className="space-y-3 text-sm">
            <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Your private address</span>
              <input readOnly value={feedUrl} className={`${inputCls} bg-[#F5FAF8] font-mono text-xs`} /></label>
            <ul className="list-disc space-y-1 pl-5 text-slate-700">
              <li><b>Google Calendar:</b> on a computer, open Google Calendar, choose the + next to Other calendars, then From URL, and paste the address. It then appears on your phone too.</li>
              <li><b>iPhone:</b> <a className="font-semibold text-teal underline" href={feedUrl.replace(/^https:/, 'webcal:')}>tap here to subscribe</a>, or in Settings add a subscribed calendar and paste the address.</li>
              <li>Each training day is an all-day entry. Google can take several hours to show a change.</li>
            </ul>
            <p className="rounded-lg bg-[#FFF8E6] p-2 text-xs text-slate-700">Treat this address like a password. Anyone who has it can read {founder ? 'the whole training schedule' : 'your training schedule'}. If it is shared by mistake, make a new address and the old one stops working at once.
              {feed[0].last_read_at ? ` Last read ${d(feed[0].last_read_at)}.` : ' It has not been read yet.'}</p>
            <div className="flex flex-wrap gap-2">
              <form action={makeFeed}><input type="hidden" name="return" value={returnTo} /><button className={ghost}>Make a new address</button></form>
              <form action={removeFeed}><input type="hidden" name="return" value={returnTo} /><button className={ghost}>Switch it off</button></form>
            </div>
          </div>
        ) : (
          <form action={makeFeed} className="space-y-2 text-sm">
            <input type="hidden" name="return" value={returnTo} />
            <p className="text-slate-700">Make a private address that your phone calendar can follow. It shows {founder ? 'every training' : 'the trainings you deliver'}, with the trainers and venue, and it updates by itself when dates change.</p>
            <button className={submitCls}>Make my phone calendar address</button>
          </form>
        )}
      </Card>
    </>
  );
}

function TrainingCard({ t, clashes, founder, today }: { t: Training; clashes: Clash[]; founder: boolean; today: string }) {
  const w = worstLevel(clashes);
  const lead = t.trainers.filter((x) => x.role === 'lead'), others = t.trainers.filter((x) => x.role !== 'lead');
  const past = (t.end ?? '') < today;
  return (
    <div id={`t-${t.id}`} className="scroll-mt-24">
      <Card className={w === 'conflict' ? 'border-red-300' : w === 'check' ? 'border-gold' : ''}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/portal/cohorts/${t.id}`} className="text-lg font-bold text-teal underline-offset-2 hover:underline">{t.name}</Link>
            <p className="text-sm text-slate-600">{t.org} · {t.format === '12-day' ? '12-Day' : '5-Day'} · {t.language === 'sw' ? 'Kiswahili' : 'English'}{t.audience ? ` · ${t.audience}` : ''}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={isTentative(t.status) ? 'gold' : t.status === 'delivering' ? 'green' : t.status === 'confirmed' ? 'teal' : 'grey'}>{STATUS_LABEL[t.status] ?? t.status}</Badge>
            {isTentative(t.status) && <Badge tone="grey">Tentative</Badge>}
            {w && <Badge tone={LEVEL_TONE[w]}>{MARK[w]} {LEVEL_LABEL[w]}</Badge>}
          </div>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs font-semibold text-slate-500">When</dt><dd>{t.start ? `${d(t.start)} to ${d(t.end)}` : 'Dates to be set'}{t.days.length ? ` · ${t.days.length} training days` : ''}{past ? ' · finished' : ''}</dd></div>
          <div><dt className="text-xs font-semibold text-slate-500">Where</dt><dd>{t.venue || 'Venue not set'}</dd></div>
          <div><dt className="text-xs font-semibold text-slate-500">Trainers</dt>
            <dd>{t.trainers.length ? <>{lead.map((x) => `${x.name} (lead)`).concat(others.map((x) => `${x.name} (${x.role === 'co' ? 'co-facilitator' : 'observer'})`)).join(', ')}</> : <span className="font-semibold text-red-700">No trainer assigned yet</span>}</dd></div>
          <div><dt className="text-xs font-semibold text-slate-500">Participants</dt><dd>{t.enrolled} enrolled{t.expected ? `, ${t.expected} expected` : ''}</dd></div>
          {founder && t.invoice !== undefined && (
            <div><dt className="text-xs font-semibold text-slate-500">Invoice</dt><dd>{t.invoice ? `${t.invoice.number} · ${t.invoice.status.replace('_', ' ')}` : 'No invoice yet'}</dd></div>
          )}
        </dl>
        {clashes.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-sm">
            {clashes.map((c) => (
              <li key={c.otherId} className={`rounded-lg p-2 ${c.level === 'conflict' ? 'bg-red-50 text-red-800' : c.level === 'check' ? 'bg-[#FFF8E6] text-slate-800' : 'bg-emerald-50 text-emerald-900'}`}>
                <b>{MARK[c.level]} Overlaps <a href={`#t-${c.otherId}`} className="underline">{c.otherName}</a> ({c.otherOrg})</b> on {c.days.length === 1 ? d(c.days[0]) : `${d(c.days[0])} to ${d(c.days[c.days.length - 1])}`}. {c.reasons[0]}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
