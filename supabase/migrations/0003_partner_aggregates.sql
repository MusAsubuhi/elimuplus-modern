-- Partners with aggregate-only agreements must still see totals and follow-up results, but never names.
-- These SECURITY DEFINER functions return de-identified rows for the caller's organisations only.

create or replace function app.partner_cohort_counts()
returns table(cohort_id uuid, enrolled int, completed int) language sql stable security definer set search_path = public as $$
  select c.id,
         (select count(*)::int from enrolments e where e.cohort_id = c.id),
         (select count(*)::int from enrolments e where e.cohort_id = c.id and e.status = 'completed')
  from cohorts c
  where c.organisation_id in (select app.my_orgs())
    and coalesce((select named_participant_access <> 'none' from agreements a where a.organisation_id = c.organisation_id), false)
$$;

create or replace function app.partner_followup_results()
returns table(cohort_id uuid, visit int, status text, sold boolean, operating boolean, income text, knows_breakeven boolean, tracks_metric boolean)
language sql stable security definer set search_path = public as $$
  select c.id, s.visit, s.status, v.sold_within_14_days, v.still_operating, v.income_direction, v.knows_breakeven, v.tracks_key_metric
  from followup_schedule s
  join enrolments e on e.id = s.enrolment_id
  join cohorts c on c.id = e.cohort_id
  left join followup_visits v on v.schedule_id = s.id
  where c.organisation_id in (select app.my_orgs())
    and coalesce((select named_participant_access <> 'none' from agreements a where a.organisation_id = c.organisation_id), false)
$$;

grant execute on function app.partner_cohort_counts(), app.partner_followup_results() to authenticated;
