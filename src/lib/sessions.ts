import { trainingDates, programmeDays } from '@/lib/billing';
type Q = (sql: string, params?: any[]) => Promise<any[]>;

/** A programme runs for 5 or 12 days. Make sure every day exists as a session (dated from the start date) so attendance can be taken on any of them. */
export async function ensureSessions(q: Q, cohortId: string) {
  const c = (await q('select start_date, format from cohorts where id=$1', [cohortId]))[0];
  if (!c?.start_date) return;
  const dates = trainingDates(c.start_date, programmeDays(c.format)); // weekends are skipped
  for (let i = 0; i < dates.length; i++) {
    await q(`insert into sessions(cohort_id, day_number, session_date) values ($1,$2,$3::date) on conflict (cohort_id, day_number) do nothing`, [cohortId, i + 1, dates[i]]);
  }
}

/** Puts a day's attendance in front of the partner. Called when a trainer confirms attendance, so the partner sees counts and names without a separate publishing step.
 *  Anything the trainer wrote for the partner (what was covered, a note) is kept; only the counts and names are refreshed. */
export async function syncDaySummary(q: Q, cohortId: string, sessionId: string, authorId: string) {
  const se = (await q('select day_number, session_date from sessions where id=$1 and cohort_id=$2', [sessionId, cohortId]))[0];
  if (!se) return;
  const att = await q(`select p.display_name name, a.present from attendance a join enrolments e on e.id=a.enrolment_id join people p on p.id=e.person_id where a.session_id=$1 order by p.display_name`, [sessionId]);
  if (!att.length) return;
  const present = att.filter((a) => a.present).length;
  const row = (await q(
    `insert into day_summaries(cohort_id, session_id, day_number, held_on, present_count, absent_count, author_id, published_at)
     values ($1,$2,$3,$4,$5,$6,$7,now())
     on conflict (session_id) do update set present_count=excluded.present_count, absent_count=excluded.absent_count returning id`,
    [cohortId, sessionId, se.day_number, se.session_date, present, att.length - present, authorId]))[0];
  await q('delete from day_summary_names where summary_id=$1', [row.id]);
  for (const a of att) await q('insert into day_summary_names(summary_id, cohort_id, name, present) values ($1,$2,$3,$4)', [row.id, cohortId, a.name, a.present]);
}
