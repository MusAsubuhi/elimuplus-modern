import 'server-only';
import { unstable_cache } from 'next/cache';
import { asAdmin } from './db';
import { iso } from './format';
import { todayNairobi } from './book';

/**
 * Numbers for the public impact page. They come only from app.public_impact(), which returns counts and percentages
 * with every figure built on fewer than 5 people removed, and never a name, phone number, photo or free text.
 */
export type PubCohort = {
  seq: number; orgName: string | null; orgType: string; county: string | null; start: string | null; end: string | null;
  status: string; format: string; small: boolean; m: Record<string, any>;
  no: number | null; label: string | null;   // public number (in the order cohorts ran) and public name
};

export const loadPublicImpact = unstable_cache(async (): Promise<PubCohort[]> => {
  const [rows, names] = await asAdmin(async (q) => [await q('select * from app.public_impact()'), await q('select seq, public_no, public_name from public.cohorts')]);
  const nm = new Map<number, any>(names.map((x: any) => [Number(x.seq), x]));
  return rows.map((r: any) => ({
    no: nm.get(Number(r.seq))?.public_no ?? null, label: nm.get(Number(r.seq))?.public_name ?? null,
    seq: Number(r.seq), orgName: r.org_name ?? null, orgType: r.org_type, county: r.county ?? null,
    start: r.start_date ? iso(r.start_date) : null, end: r.end_date ? iso(r.end_date) : null,
    status: r.status, format: r.format, small: !!r.small, m: r.m ?? {},
  }));
}, ['public-impact-v2'], { revalidate: 600 });

/** Mentoring in numbers: circles and sessions, plus people once at least five are involved. Nothing else is ever published. */
export const loadPublicMentoring = unstable_cache(async (): Promise<{ circles: number; meetings: number; people: number | null }> => {
  const r = (await asAdmin((q) => q('select app.public_mentoring() r')))[0]?.r ?? {};
  return { circles: Number(r.circles) || 0, meetings: Number(r.meetings) || 0, people: r.people == null ? null : Number(r.people) };
}, ['public-mentoring-v1'], { revalidate: 600 });

/** Cohorts that ran before the portal (kept as plain counts in historical_cohorts): added to the two headline tiles only. */
export type HistCohort = { no: number | null; label: string | null; audience: string; period: string; people: number };
export const loadPublicHistory = unstable_cache(async (): Promise<{ cohorts: number; people: number; list: HistCohort[] }> => {
  const rows = await asAdmin((q) => q('select public_no, public_name, audience, period, people_counted from public.historical_cohorts order by public_no nulls last'));
  const list = rows.map((r: any) => ({ no: r.public_no == null ? null : Number(r.public_no), label: r.public_name ?? null, audience: r.audience, period: r.period, people: Number(r.people_counted) || 0 }));
  return { cohorts: list.length, people: list.reduce((s: number, x: HistCohort) => s + x.people, 0), list };
}, ['public-history-v2'], { revalidate: 600 });

const n = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
export type Phase = 'running' | 'finished';
export const phaseOf = (c: { start: string | null; end: string | null }, today = todayNairobi()): Phase => ((c.end ?? c.start ?? today) < today ? 'finished' : 'running');

/** Everything added up across the cohorts given (all of them, or just one). Rates are rebuilt from counts, never averaged from rates. */
export function rollup(list: PubCohort[]) {
  const today = todayNairobi();
  const full = list.filter((c) => !c.small);
  const sum = (f: (m: Record<string, any>) => unknown, from = full) => from.reduce((s, c) => s + n(f(c.m)), 0);
  const enrolled = list.reduce((s, c) => s + n(c.m.enrolled), 0);
  const finished = list.filter((c) => phaseOf(c, today) === 'finished');
  const running = list.filter((c) => phaseOf(c, today) === 'running');
  const completed = list.reduce((s, c) => s + n(c.m.completed), 0);
  const att = full.filter((c) => c.m.attendance_rate != null);
  const attW = att.reduce((s, c) => s + n(c.m.enrolled), 0);
  const learn = full.filter((c) => c.m.learning);
  const learnN = learn.reduce((s, c) => s + n(c.m.learning.n), 0);
  const ex = full.filter((c) => c.m.exit);
  const exN = ex.reduce((s, c) => s + n(c.m.exit.n), 0);
  const stage = (k: string) => {
    const rows = full.map((c) => c.m.adult?.[k]).filter(Boolean);
    const t = (f: string) => rows.reduce((s, r) => s + n(r[f]), 0);
    return { n: t('n'), operating: t('operating'), sold14: t('sold14'), sold14Known: t('sold14_known'), higher: t('higher'), same: t('same'), lower: t('lower'),
      recordsDaily: t('records_daily'), separates: t('separates_always'), growing: t('growing'), stable: t('stable'), struggling: t('struggling'), closed: t('closed') };
  };
  const ystage = (k: string) => {
    const rows = full.map((c) => c.m.youth?.[k]).filter(Boolean);
    const t = (f: string) => rows.reduce((s, r) => s + n(r[f]), 0);
    return { n: t('n'), firstIncome: t('first_income'), cvReady: t('cv_ready'), applications: t('applications'), interviews: t('interviews'), ventureStarted: t('venture_started'), ventureOperating: t('venture_operating') };
  };
  const base = full.map((c) => c.m.baseline).filter(Boolean);
  const bt = (f: string) => base.reduce((s, r) => s + n(r[f]), 0);
  const age: Record<string, number> = {};
  for (const c of full) for (const [k, v] of Object.entries(c.m.age ?? {})) age[k] = (age[k] ?? 0) + n(v);
  return {
    cohorts: list.length, enrolled, completed,
    inTraining: Math.max(0, running.reduce((s, c) => s + n(c.m.enrolled), 0) - running.reduce((s, c) => s + n(c.m.completed), 0)),
    finishedEnrolled: finished.reduce((s, c) => s + n(c.m.enrolled), 0), finishedCompleted: finished.reduce((s, c) => s + n(c.m.completed), 0),
    female: sum((m) => m.female), male: sum((m) => m.male), age,
    sessions: sum((m) => m.sessions),
    attendance: attW ? Math.round(att.reduce((s, c) => s + n(c.m.attendance_rate) * n(c.m.enrolled), 0) / attW) : null,
    learning: learnN ? { n: learnN, pre: Math.round(learn.reduce((s, c) => s + n(c.m.learning.pre_pct) * n(c.m.learning.n), 0) / learnN), post: Math.round(learn.reduce((s, c) => s + n(c.m.learning.post_pct) * n(c.m.learning.n), 0) / learnN), gain: Math.round(learn.reduce((s, c) => s + n(c.m.learning.gain) * n(c.m.learning.n), 0) / learnN) } : null,
    exit: exN ? { n: exN, rating: Math.round((ex.reduce((s, c) => s + n(c.m.exit.rating) * n(c.m.exit.n), 0) / exN) * 10) / 10, recommend: Math.round(ex.reduce((s, c) => s + n(c.m.exit.recommend_pct) * n(c.m.exit.n), 0) / exN) } : null,
    baseline: base.length ? { n: bt('n'), operating: bt('operating'), recordsDaily: bt('records_daily'), separates: bt('separates_always') } : null,
    adult: { 30: stage('30'), 60: stage('60'), 90: stage('90') } as Record<string, ReturnType<typeof stage>>,
    youth: { 30: ystage('30'), 60: ystage('60'), 90: ystage('90') } as Record<string, ReturnType<typeof ystage>>,
  };
}

export const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthYear = (s: string | null) => (s ? `${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}` : '');
export const addDays = (s: string, days: number) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
