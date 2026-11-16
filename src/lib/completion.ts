import type { Q } from '@/lib/db';

/** Share of the programme days a person must attend to count as having completed. Four of five days, ten of twelve. */
export const COMPLETION_SHARE = 0.8;
export const daysRequired = (format?: string) => Math.ceil(COMPLETION_SHARE * (format === '12-day' ? 12 : 5));

/** Once a cohort's training days are over, everyone still "enrolled" who attended enough days (class days or recorded make-up days) is completed.
 *  Certificates are a keepsake and play no part in this. Returns how many people were moved to completed. */
export async function refreshCompletion(q: Q, cohortId?: string): Promise<number> {
  const rows = await q(
    `update enrolments e set status = 'completed'
       from cohorts c
      where c.id = e.cohort_id and e.status = 'enrolled'
        and ($1::uuid is null or c.id = $1::uuid)
        and coalesce(c.end_date, (select max(s.session_date) from sessions s where s.cohort_id = c.id)) < (now() at time zone 'Africa/Nairobi')::date
        and (select count(*) from attendance a join sessions s on s.id = a.session_id
              where a.enrolment_id = e.id and s.cohort_id = c.id and (a.present or a.made_up_on is not null))
            >= ceil($2::numeric * case when c.format = '12-day' then 12 else 5 end)
      returning e.id`, [cohortId ?? null, COMPLETION_SHARE]);
  return rows.length;
}
