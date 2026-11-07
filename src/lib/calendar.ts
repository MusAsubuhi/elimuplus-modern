import 'server-only';
import { randomBytes } from 'node:crypto';
import type { Q } from './db';
import { programmeDays, trainingDates, trainingEnds } from './billing';
import { findClashes, isoOf, type Clash, type Confirmation, type Training } from './calendar-core';

export type CalendarData = { trainings: Training[]; clashes: Map<string, Clash[]> };

/**
 * Every training this person may see, with its days, trainers and overlaps.
 * Run it inside asUser so the database decides what each person sees: founders see everything,
 * trainers see the trainings they deliver. Money is only read for founders.
 */
export async function loadCalendar(q: Q, opts: { founder: boolean }): Promise<CalendarData> {
  const cohorts = await q(`select c.id, c.name, c.format, c.language, c.audience, c.start_date, c.end_date, c.venue,
      c.expected_participants, c.status, o.name org_name,
      (select count(*) from enrolments e where e.cohort_id=c.id)::int n
    from cohorts c join organisations o on o.id=c.organisation_id order by c.start_date nulls last, c.seq`);
  if (!cohorts.length) return { trainings: [], clashes: new Map() };
  const [facs, sess, confs, inv] = await Promise.all([
    q(`select cf.cohort_id, cf.role, p.id person_id, coalesce(nullif(p.display_name,''), p.full_name, 'Trainer') name
         from cohort_facilitators cf left join people p on p.id=cf.person_id
         order by case cf.role when 'lead' then 0 when 'co' then 1 else 2 end, p.full_name`),
    q('select cohort_id, day_number, session_date from sessions where session_date is not null order by cohort_id, day_number'),
    q('select cohort_a, cohort_b, confirmed_at, note, (select coalesce(nullif(p.display_name,\'\'), p.full_name) from people p where p.id=confirmed_by) by_name from calendar_clash_confirmations'),
    opts.founder
      ? q(`select distinct on (cohort_id) cohort_id, number, status, amount_kes from invoices where cohort_id is not null order by cohort_id, issued_on desc, number desc`)
      : Promise.resolve([] as any[]),
  ]);

  const trainings: Training[] = cohorts.map((c) => {
    const n = programmeDays(c.format);
    const recorded = new Map<number, string>();
    for (const s of sess.filter((x) => x.cohort_id === c.id)) recorded.set(Number(s.day_number), isoOf(s.session_date));
    const planned = c.start_date ? trainingDates(c.start_date, n) : [];
    const days: string[] = [];
    for (let i = 1; i <= n; i++) { const d = recorded.get(i) ?? planned[i - 1]; if (d) days.push(d); }
    days.sort();
    // A founder may record an end date earlier than the standard programme length; the calendar follows it.
    if (c.end_date) {
      const cut = isoOf(c.end_date);
      const kept = days.filter((x) => x <= cut);
      if (kept.length) days.splice(0, days.length, ...kept);
    }
    const iv = inv.find((x) => x.cohort_id === c.id);
    return {
      id: c.id, name: c.name, org: c.org_name, status: c.status, format: c.format, language: c.language,
      audience: c.audience ?? null, venue: c.venue ?? null, expected: c.expected_participants ?? null, enrolled: c.n,
      start: days[0] ?? (c.start_date ? isoOf(c.start_date) : null),
      end: days.length ? days[days.length - 1] : trainingEnds(c),
      days,
      trainers: facs.filter((f) => f.cohort_id === c.id).map((f) => ({ id: f.person_id, name: f.name, role: f.role })),
      invoice: opts.founder ? (iv ? { number: iv.number, status: iv.status, amountKes: iv.amount_kes } : null) : undefined,
    };
  });

  const confirmations: Confirmation[] = confs.map((x) => ({ a: x.cohort_a, b: x.cohort_b, by: x.by_name ?? null, at: isoOf(x.confirmed_at), note: x.note ?? null }));
  return { trainings, clashes: findClashes(trainings, confirmations) };
}

/** A long random address for the phone calendar feed. Anyone holding it can read the schedule, so it can be replaced at any time. */
export const newFeedToken = () => randomBytes(24).toString('base64url');
export const FEED_TOKEN = /^[A-Za-z0-9_-]{32,64}$/;
