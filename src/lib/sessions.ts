type Q = (sql: string, params?: any[]) => Promise<any[]>;

/** A programme runs for 5 or 12 days. Make sure every day exists as a session (dated from the start date) so attendance can be taken on any of them. */
export async function ensureSessions(q: Q, cohortId: string) {
  const c = (await q('select start_date, format from cohorts where id=$1', [cohortId]))[0];
  if (!c?.start_date) return;
  const days = c.format === '12-day' ? 12 : 5;
  await q(
    `insert into sessions(cohort_id, day_number, session_date)
     select $1, g, $2::date + (g - 1) from generate_series(1, $3::int) g
     on conflict (cohort_id, day_number) do nothing`, [cohortId, c.start_date, days]);
}
