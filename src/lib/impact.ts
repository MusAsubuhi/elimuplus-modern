import 'server-only';
import type { Q } from './db';
import { todayNairobi } from './book';

export type Impact = Record<string, any>;

/** De-identified results per cohort, from app.cohort_impact(). Totals only, safe for partners on an aggregate agreement. */
export async function loadImpact(q: Q, cohortId?: string) {
  const rows = await q(
    `select i.cohort_id, i.metrics, c.name, c.start_date, c.end_date, c.status, c.format, o.name org_name
     from app.cohort_impact() i join cohorts c on c.id = i.cohort_id join organisations o on o.id = c.organisation_id
     ${cohortId ? 'where i.cohort_id = $1' : ''} order by c.seq`, cohortId ? [cohortId] : []);
  return rows.map((r) => ({ id: r.cohort_id as string, name: r.name as string, org: r.org_name as string, start: r.start_date, end: r.end_date, status: r.status as string, format: r.format as string, m: r.metrics as Impact }));
}

const n = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

/** Headline numbers added up across cohorts. */
export function totals(list: { m: Impact }[]) {
  const sum = (f: (m: Impact) => unknown) => list.reduce((s, c) => s + n(f(c.m)), 0);
  const adult = (st: string, k: string) => sum((m) => m.adult?.[st]?.[k]);
  const youth = (st: string, k: string) => sum((m) => m.youth?.[st]?.[k]);
  const att = list.filter((c) => c.m.attendance_rate != null);
  return {
    enrolled: sum((m) => m.enrolled), completed: sum((m) => m.completed), dropped: sum((m) => m.dropped),
    female: sum((m) => m.gender?.female), male: sum((m) => m.gender?.male),
    disability: sum((m) => m.disability), hadBusiness: sum((m) => m.had_business),
    attendance: att.length ? Math.round(att.reduce((s, c) => s + n(c.m.attendance_rate), 0) / att.length) : null,
    supportKes: sum((m) => m.support?.total_kes), supportPeople: sum((m) => m.support?.people),
    storyConsent: sum((m) => m.story_named) + sum((m) => m.story_anon),
    adult: (st: string) => ({ due: adult(st, 'due'), n: adult(st, 'n'), operating: adult(st, 'operating'), sold14: adult(st, 'sold14'), sold14Known: adult(st, 'sold14_known'),
      higher: adult(st, 'higher'), same: adult(st, 'same'), lower: adult(st, 'lower'), unreachable: adult(st, 'unreachable'), urgent: adult(st, 'urgent'),
      recordsDaily: adult(st, 'records_daily'), separates: adult(st, 'separates_always'), 
      growing: adult(st, 'growing'), stable: adult(st, 'stable'), struggling: adult(st, 'struggling'), closed: adult(st, 'closed') }),
    youth: (st: string) => ({ n: youth(st, 'n'), firstIncome: youth(st, 'first_income'), cvReady: youth(st, 'cv_ready'), interviews: youth(st, 'interviews'), applications: youth(st, 'applications'),
      ventureStarted: youth(st, 'venture_started'), ventureOperating: youth(st, 'venture_operating'), onTrack: youth(st, 'on_track'), needsSupport: youth(st, 'needs_support'), disengaged: youth(st, 'disengaged') }),
  };
}

export const label = (k: string) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
export const tallyRows = (t: Record<string, number> | null | undefined) => Object.entries(t ?? {}).filter(([k]) => k !== 'null').sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ name: label(k), value: v }));

export type Phase = 'upcoming' | 'running' | 'finished';
const isoDay = (v: unknown) => (v ? (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10) : null);

/** Where a cohort is on the calendar: not started, in session today, or past its last day. */
export function cohortPhase(c: { start: unknown; end: unknown }, today = todayNairobi()): Phase {
  const s = isoDay(c.start), e = isoDay(c.end) ?? s;
  if (!s || s > today) return 'upcoming';
  return e && e < today ? 'finished' : 'running';
}

/** Who is where: trained (completed), in training now, upcoming, and finished without completing. Dropped people are counted apart. */
export function stageSplit(list: { start: unknown; end: unknown; m: Impact }[]) {
  const today = todayNairobi();
  const out = { trained: 0, inTraining: 0, upcoming: 0, notCompleted: 0, dropped: 0, total: 0 };
  for (const c of list) {
    const enrolled = n(c.m.enrolled), completed = n(c.m.completed), dropped = n(c.m.dropped);
    const live = Math.max(0, enrolled - completed - dropped);
    const ph = cohortPhase(c, today);
    out.trained += completed; out.dropped += dropped; out.total += enrolled;
    if (ph === 'upcoming') out.upcoming += live; else if (ph === 'running') out.inTraining += live; else out.notCompleted += live;
  }
  return out;
}

export const phaseLabel = (p: Phase) => (p === 'upcoming' ? 'Upcoming' : p === 'running' ? 'In training' : 'Finished');
