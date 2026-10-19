import 'server-only';
import type { Q } from './db';

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
      recordsDaily: adult(st, 'records_daily'), separates: adult(st, 'separates_always'), mealAny: adult(st, 'meal_any'), setAside: adult(st, 'set_aside'),
      growing: adult(st, 'growing'), stable: adult(st, 'stable'), struggling: adult(st, 'struggling'), closed: adult(st, 'closed') }),
    youth: (st: string) => ({ n: youth(st, 'n'), firstIncome: youth(st, 'first_income'), cvReady: youth(st, 'cv_ready'), interviews: youth(st, 'interviews'), applications: youth(st, 'applications'),
      ventureStarted: youth(st, 'venture_started'), ventureOperating: youth(st, 'venture_operating'), onTrack: youth(st, 'on_track'), needsSupport: youth(st, 'needs_support'), disengaged: youth(st, 'disengaged') }),
  };
}

export const label = (k: string) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
export const tallyRows = (t: Record<string, number> | null | undefined) => Object.entries(t ?? {}).filter(([k]) => k !== 'null').sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ name: label(k), value: v }));
