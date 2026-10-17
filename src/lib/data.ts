import 'server-only';
import type { Q, Row } from './db';

export const PHASES: { n: number; boxes: number[] }[] = [
  { n: 1, boxes: [1, 2] }, { n: 2, boxes: [3, 4] }, { n: 3, boxes: [5, 6, 7] }, { n: 4, boxes: [9, 11, 12] }, { n: 5, boxes: [8, 10] },
];

export async function participantContext(q: Q, personId: string) {
  const en = (await q(
    `select e.*, c.name cohort_name, c.format, c.start_date, c.end_date, c.status cohort_status, c.language cohort_language, o.name org_name
     from enrolments e join cohorts c on c.id=e.cohort_id join organisations o on o.id=c.organisation_id
     where e.person_id=$1 order by c.start_date desc limit 1`, [personId]))[0];
  if (!en) return null;
  const [boxes, unlocks, canvas] = await Promise.all([
    q('select * from canvas_boxes order by number'),
    q('select box_number from canvas_unlocks where cohort_id=$1', [en.cohort_id]),
    q('select * from canvases where enrolment_id=$1', [en.id]),
  ]);
  const cv = canvas[0] ?? null;
  const answers = cv ? await q(
    `select distinct on (box_number, question_key) box_number, question_key, answer, language, assisted, version, created_at
     from canvas_answers where canvas_id=$1 order by box_number, question_key, version desc`, [cv.id]) : [];
  const schedule = await q(
    `select s.*, v.visited_on, v.still_operating, v.sold_within_14_days from followup_schedule s
     left join followup_visits v on v.schedule_id=s.id where s.enrolment_id=$1 order by s.visit`, [en.id]);
  const unlocked = new Set(unlocks.map((u) => u.box_number as number));
  const filled = new Set(answers.map((a) => a.box_number as number));
  return { en, boxes, unlocked, canvas: cv, answers, filled, schedule };
}

export type PCtx = NonNullable<Awaited<ReturnType<typeof participantContext>>>;

export function answerMap(answers: Row[]) {
  const m = new Map<string, Row>();
  for (const a of answers) m.set(`${a.box_number}:${a.question_key}`, a);
  return m;
}

/** Survival = at least one sale in the 14 days before the visit, among people reached at that visit. */
export function followupStats(rows: Row[]) {
  const by = (v: number) => rows.filter((r) => r.visit === v);
  const stat = (v: number) => {
    const all = by(v);
    const done = all.filter((r) => r.status === 'done');
    const unreachable = all.filter((r) => r.status === 'unreachable');
    const survived = done.filter((r) => r.sold_within_14_days === true).length;
    return {
      visit: v, total: all.length, done: done.length, unreachable: unreachable.length,
      scheduled: all.filter((r) => r.status === 'scheduled').length,
      reach: all.length ? Math.round(((done.length) / all.length) * 100) : 0,
      survival: done.length ? Math.round((survived / done.length) * 100) : 0, survived,
    };
  };
  return [30, 60, 90].map(stat);
}
