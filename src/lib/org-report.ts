import 'server-only';
import type { Impact } from './impact';

/**
 * One model feeds the on-screen preview, the PDF and the CSV, so the three can never disagree.
 * Everything here is an aggregate from app.cohort_impact(): no participant is named or identifiable.
 */
export const REPORT_SECTIONS: { key: string; label: string; blurb: string }[] = [
  { key: 'reach', label: 'Reach and completion', blurb: 'Who enrolled, who finished, attendance and gender balance.' },
  { key: 'learning', label: 'What participants learned', blurb: 'Before and after learning checks, compared for the same people.' },
  { key: 'followup', label: 'Business results after training', blurb: 'Trading, income and money habits at 30, 60 and 90 days.' },
  { key: 'youth', label: 'Youth pathways', blurb: 'First income, CV readiness and interviews for youth participants.' },
  { key: 'feedback', label: 'Participant feedback', blurb: 'Ratings and whether participants would recommend the training.' },
];
export const SECTION_KEYS = REPORT_SECTIONS.map((s) => s.key);

export interface CohortIn { id: string; name: string; org: string; start: string | Date | null; end: string | Date | null; status: string; m: Impact }
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
export const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 100) : null);

export interface Stage { stage: number; due: number; reached: number; unreachable: number; trading: number | null; tradingBase: number; higher: number | null; records: number | null; separates: number | null }
export interface Row {
  id: string; name: string; start: string | Date | null; end: string | Date | null; status: string;
  enrolled: number; completed: number; completion: number | null; female: number; male: number; attendance: number | null;
  prePct: number | null; postPct: number | null; gain: number | null; pairedN: number;
  stages: Stage[];
  youthN: number; firstIncome: number | null; cvReady: number | null; interviews: number;
  exitN: number; rating: number | null; recommend: number | null;
}
export interface Model { rows: Row[]; total: Row }

function stageOf(m: Impact, st: number): Stage {
  const a = m.adult?.[String(st)] ?? {};
  return {
    stage: st, due: num(a.due), reached: num(a.n), unreachable: num(a.unreachable),
    trading: pct(num(a.sold14), num(a.sold14_known)), tradingBase: num(a.sold14_known),
    higher: pct(num(a.higher), num(a.n)), records: pct(num(a.records_daily), num(a.n)), separates: pct(num(a.separates_always), num(a.n)),
  };
}
function rowOf(c: CohortIn): Row {
  const m = c.m, l = m.learning ?? {}, x = m.exit ?? {}, y = m.youth?.['30'] ?? {};
  const youthN = ['30', '60', '90'].reduce((s, k) => s + num(m.youth?.[k]?.n), 0);
  return {
    id: c.id, name: c.name, start: c.start, end: c.end, status: c.status,
    enrolled: num(m.enrolled), completed: num(m.completed), completion: pct(num(m.completed), num(m.enrolled)),
    female: num(m.gender?.female), male: num(m.gender?.male), attendance: m.attendance_rate != null ? num(m.attendance_rate) : null,
    prePct: l.pre_pct != null ? num(l.pre_pct) : null, postPct: l.post_pct != null ? num(l.post_pct) : null,
    gain: num(l.paired_n) ? num(l.paired_gain) : null, pairedN: num(l.paired_n),
    stages: [30, 60, 90].map((s) => stageOf(m, s)),
    youthN, firstIncome: pct(num(y.first_income), num(y.n)), cvReady: pct(num(y.cv_ready), num(y.n)), interviews: ['30', '60', '90'].reduce((s, k) => s + num(m.youth?.[k]?.interviews), 0),
    exitN: num(x.n), rating: x.n ? Math.round(num(x.rating) * 10) / 10 : null, recommend: pct(num(x.recommend), num(x.n)),
  };
}
export function buildModel(list: CohortIn[]): Model {
  const rows = list.map(rowOf);
  const sum = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0);
  const wavg = (f: (r: Row) => number | null, w: (r: Row) => number, dec = 0) => {
    const xs = rows.filter((r) => f(r) != null && w(r) > 0);
    const tw = xs.reduce((s, r) => s + w(r), 0);
    return tw ? Math.round((xs.reduce((s, r) => s + (f(r) as number) * w(r), 0) / tw) * 10 ** dec) / 10 ** dec : null;
  };
  const enrolled = sum((r) => r.enrolled), completed = sum((r) => r.completed);
  const total: Row = {
    id: 'total', name: 'All selected cohorts', start: null, end: null, status: '',
    enrolled, completed, completion: pct(completed, enrolled), female: sum((r) => r.female), male: sum((r) => r.male),
    attendance: wavg((r) => r.attendance, (r) => r.enrolled), prePct: wavg((r) => r.prePct, (r) => r.enrolled), postPct: wavg((r) => r.postPct, (r) => r.enrolled),
    gain: wavg((r) => r.gain, (r) => r.pairedN), pairedN: sum((r) => r.pairedN),
    stages: [0, 1, 2].map((i) => {
      const st = rows.map((r) => r.stages[i]);
      const s = (f: (x: Stage) => number) => st.reduce((a, x) => a + f(x), 0);
      const w = (f: (x: Stage) => number | null, wt: (x: Stage) => number) => {
        const xs = st.filter((x) => f(x) != null && wt(x) > 0), tw = xs.reduce((a, x) => a + wt(x), 0);
        return tw ? Math.round(xs.reduce((a, x) => a + (f(x) as number) * wt(x), 0) / tw) : null;
      };
      return { stage: [30, 60, 90][i], due: s((x) => x.due), reached: s((x) => x.reached), unreachable: s((x) => x.unreachable), trading: w((x) => x.trading, (x) => x.tradingBase), tradingBase: s((x) => x.tradingBase),
        higher: w((x) => x.higher, (x) => x.reached), records: w((x) => x.records, (x) => x.reached), separates: w((x) => x.separates, (x) => x.reached) };
    }),
    youthN: sum((r) => r.youthN), firstIncome: wavg((r) => r.firstIncome, (r) => r.youthN), cvReady: wavg((r) => r.cvReady, (r) => r.youthN), interviews: sum((r) => r.interviews),
    exitN: sum((r) => r.exitN), rating: wavg((r) => r.rating, (r) => r.exitN, 1), recommend: wavg((r) => r.recommend, (r) => r.exitN),
  };
  return { rows, total };
}

export const hasData = (m: Model, key: string) => {
  const r = m.total;
  return key === 'reach' ? r.enrolled > 0 : key === 'learning' ? r.prePct != null || r.postPct != null : key === 'followup' ? r.stages.some((s) => s.reached > 0)
    : key === 'youth' ? r.youthN > 0 : key === 'feedback' ? r.exitN > 0 : false;
};

/** Plain-language takeaways, including how cohorts compare when more than one is chosen. */
export function takeaways(m: Model, key: string): string[] {
  const { rows, total: t } = m, out: string[] = [];
  const best = <T,>(f: (r: Row) => number | null, label: string, fmt: (v: number) => string) => {
    const xs = rows.filter((r) => f(r) != null);
    if (xs.length < 2) return;
    const hi = xs.reduce((a, b) => ((f(b) as number) > (f(a) as number) ? b : a)), lo = xs.reduce((a, b) => ((f(b) as number) < (f(a) as number) ? b : a));
    if (hi.id !== lo.id) out.push(`${label} was highest in ${hi.name} (${fmt(f(hi) as number)}) and lowest in ${lo.name} (${fmt(f(lo) as number)}).`);
  };
  const P = (v: number) => `${v}%`;
  if (key === 'reach') {
    out.push(`${t.enrolled} people enrolled and ${t.completed} completed${t.completion != null ? `, a completion rate of ${t.completion}%` : ''}.`);
    if (t.female + t.male) out.push(`${pct(t.female, t.female + t.male)}% of participants were women.`);
    if (t.attendance != null) out.push(`Average attendance was ${t.attendance}%.`);
    best((r) => r.completion, 'Completion', P); best((r) => r.attendance, 'Attendance', P);
  }
  if (key === 'learning') {
    if (t.gain != null) out.push(`People who took both checks improved by ${t.gain} percentage points on average (${t.pairedN} people).`);
    else if (t.prePct != null || t.postPct != null) out.push('The after-training check is not complete yet, so a fair before-and-after comparison is not possible.');
    best((r) => r.gain, 'The learning gain', (v) => `${v >= 0 ? '+' : ''}${v} points`);
  }
  if (key === 'followup') {
    const s = t.stages;
    const tr = s.filter((x) => x.trading != null);
    if (tr.length) out.push(`${tr.map((x) => `${x.trading}% were trading at ${x.stage} days`).join(', ')}, among people reached.`);
    if (tr.length >= 2) { const d = (tr[tr.length - 1].trading as number) - (tr[0].trading as number); out.push(`From day ${tr[0].stage} to day ${tr[tr.length - 1].stage}, trading ${d > 0 ? 'rose' : d < 0 ? 'fell' : 'held'}${d ? ` by ${Math.abs(d)} points` : ''}.`); }
    const last = [...s].reverse().find((x) => x.reached > 0);
    if (last) out.push(`${last.reached} of ${last.due || last.reached} people due were reached at day ${last.stage}.`);
    best((r) => r.stages[0].trading, 'Trading at 30 days', P);
  }
  if (key === 'youth') {
    if (t.firstIncome != null) out.push(`${t.firstIncome}% of youth reported first income${t.cvReady != null ? ` and ${t.cvReady}% had a CV ready` : ''}.`);
    out.push(`${t.interviews} interviews were reported in total.`);
  }
  if (key === 'feedback') {
    if (t.rating != null) out.push(`Participants rated the training ${t.rating} out of 5 on average${t.recommend != null ? `, and ${t.recommend}% would recommend it` : ''} (${t.exitN} responses).`);
    best((r) => r.rating, 'The rating', (v) => `${v}/5`);
  }
  return out;
}

const csvCell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** One row per cohort plus a total, every figure an aggregate. */
export function toCsv(m: Model): string {
  const head = ['Cohort', 'Start', 'End', 'Status', 'Enrolled', 'Completed', 'Completion %', 'Women', 'Men', 'Attendance %', 'Learning check before %', 'Learning check after %', 'Paired learning gain (points)', 'People with both checks',
    ...[30, 60, 90].flatMap((s) => [`Day ${s}: due`, `Day ${s}: reached`, `Day ${s}: trading %`, `Day ${s}: income higher %`]),
    'Youth reported', 'Youth first income %', 'Youth CV ready %', 'Interviews', 'Feedback responses', 'Rating (of 5)', 'Would recommend %'];
  const iso = (d: string | Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');
  const line = (r: Row) => [r.name, iso(r.start), iso(r.end), r.status, r.enrolled, r.completed, r.completion, r.female, r.male, r.attendance, r.prePct, r.postPct, r.gain, r.pairedN,
    ...r.stages.flatMap((s) => [s.due, s.reached, s.trading, s.higher]), r.youthN, r.firstIncome, r.cvReady, r.interviews, r.exitN, r.rating, r.recommend];
  return [head, ...m.rows.map(line), line(m.total)].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
