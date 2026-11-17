-- Public impact page: totals and percentages only, safe to show anyone.
-- 1. The per-cohort results calculation moves into app.cohort_metrics(cohort) so the signed-in views and the public page share it.
-- 2. app.public_impact() returns only a whitelist of counts, hides any figure built on fewer than 5 people, and leaves out
--    cohorts of organisations whose public listing is switched off. It never returns a name, phone, photo or free text.

alter table public.agreements add column if not exists public_listing text not null default 'anonymous' check (public_listing in ('hidden','anonymous','named'));

create or replace function app.cohort_metrics(c public.cohorts)
returns jsonb language sql stable security definer set search_path = public as $$
  select
    -- who
    jsonb_build_object(
      'enrolled',  (select count(*)::int from public.enrolments e where e.cohort_id = c.id),
      'completed', (select count(*)::int from public.enrolments e where e.cohort_id = c.id and e.status = 'completed'),
      'dropped',   (select count(*)::int from public.enrolments e where e.cohort_id = c.id and e.status = 'dropped'),
      'gender',    (select app.tally(array_agg(coalesce(p.gender, 'unknown'))) from public.enrolments e join public.people p on p.id = e.person_id where e.cohort_id = c.id),
      'age',       (select app.tally(array_agg(case when p.birth_year is null then 'unknown'
                      when extract(year from coalesce(c.start_date, current_date))::int - p.birth_year < 18 then 'under_18'
                      when extract(year from coalesce(c.start_date, current_date))::int - p.birth_year <= 24 then '18_24'
                      when extract(year from coalesce(c.start_date, current_date))::int - p.birth_year <= 34 then '25_34'
                      else '35_plus' end))
                    from public.enrolments e join public.people p on p.id = e.person_id where e.cohort_id = c.id),
      'disability', (select count(*)::int from public.enrolments e join public.people p on p.id = e.person_id where e.cohort_id = c.id and p.has_disability),
      'track',     (select app.tally(array_agg(e.track)) from public.enrolments e where e.cohort_id = c.id),
      'had_business', (select count(*)::int from public.enrolments e where e.cohort_id = c.id and e.has_business_at_entry),
      'with_partner_ref', (select count(*)::int from public.enrolments e where e.cohort_id = c.id and e.partner_ref is not null and e.partner_ref <> ''),
      'story_named', (select count(*)::int from public.enrolments e where e.cohort_id = c.id and e.story_consent = 'named'),
      'story_anon',  (select count(*)::int from public.enrolments e where e.cohort_id = c.id and e.story_consent = 'anonymous'),
      'exit_reasons', (select app.tally(array_agg(app.code(e.exit_reason))) from public.enrolments e where e.cohort_id = c.id and e.status = 'dropped')
    )
    -- attendance, learning, feedback, support
    || jsonb_build_object(
      'attendance_rate', (select round(100.0 * count(*) filter (where a.present) / nullif(count(*), 0))::int
                          from public.attendance a join public.sessions s on s.id = a.session_id where s.cohort_id = c.id),
      'sessions',  (select count(*)::int from public.sessions s where s.cohort_id = c.id),
      'learning',  jsonb_build_object(
          'pre_n',  (select count(*)::int from public.learning_checks l join public.enrolments e on e.id = l.enrolment_id where e.cohort_id = c.id and l.stage = 'pre'),
          'post_n', (select count(*)::int from public.learning_checks l join public.enrolments e on e.id = l.enrolment_id where e.cohort_id = c.id and l.stage = 'post'),
          'pre_pct',  (select round(avg(100.0 * l.score / nullif(l.out_of, 0)))::int from public.learning_checks l join public.enrolments e on e.id = l.enrolment_id where e.cohort_id = c.id and l.stage = 'pre'),
          'post_pct', (select round(avg(100.0 * l.score / nullif(l.out_of, 0)))::int from public.learning_checks l join public.enrolments e on e.id = l.enrolment_id where e.cohort_id = c.id and l.stage = 'post'),
          'pre_conf',  (select round(avg(l.confidence), 1) from public.learning_checks l join public.enrolments e on e.id = l.enrolment_id where e.cohort_id = c.id and l.stage = 'pre'),
          'post_conf', (select round(avg(l.confidence), 1) from public.learning_checks l join public.enrolments e on e.id = l.enrolment_id where e.cohort_id = c.id and l.stage = 'post'),
          -- people who took both checks: the fair before-and-after comparison
          'paired_n', (select count(*)::int from public.learning_checks a join public.learning_checks b on b.enrolment_id = a.enrolment_id and b.stage = 'post'
                       join public.enrolments e on e.id = a.enrolment_id where e.cohort_id = c.id and a.stage = 'pre'),
          'paired_gain', (select round(avg(100.0 * b.score / nullif(b.out_of, 0) - 100.0 * a.score / nullif(a.out_of, 0)))::int
                       from public.learning_checks a join public.learning_checks b on b.enrolment_id = a.enrolment_id and b.stage = 'post'
                       join public.enrolments e on e.id = a.enrolment_id where e.cohort_id = c.id and a.stage = 'pre')),
      'exit', jsonb_build_object(
          'n', (select count(*)::int from public.exit_feedback x join public.enrolments e on e.id = x.enrolment_id where e.cohort_id = c.id),
          'rating', (select round(avg(x.rating), 1) from public.exit_feedback x join public.enrolments e on e.id = x.enrolment_id where e.cohort_id = c.id),
          'confidence', (select round(avg(x.confidence), 1) from public.exit_feedback x join public.enrolments e on e.id = x.enrolment_id where e.cohort_id = c.id),
          'recommend', (select count(*)::int from public.exit_feedback x join public.enrolments e on e.id = x.enrolment_id where e.cohort_id = c.id and x.recommend),
          'concerns', (select count(*)::int from public.exit_feedback x join public.enrolments e on e.id = x.enrolment_id where e.cohort_id = c.id and x.concern)),
      'support', jsonb_build_object(
          'total_kes', (select coalesce(sum(s.amount_kes), 0)::int from public.support_ledger s join public.enrolments e on e.id = s.enrolment_id where e.cohort_id = c.id),
          'people',    (select count(distinct s.enrolment_id)::int from public.support_ledger s join public.enrolments e on e.id = s.enrolment_id where e.cohort_id = c.id))
    )
    -- Day 0 for the adults, in the same shape as each follow-up stage so they line up
    || jsonb_build_object(
      'baseline', (select jsonb_build_object(
          'n', count(*)::int,
          'adult_n', count(*) filter (where b.kind = 'adult')::int,
          'youth_n', count(*) filter (where b.kind = 'youth')::int,
          'operating', count(*) filter (where b.business_stage = 'running')::int,
          'records_daily', count(*) filter (where b.keeps_records = 'daily')::int,
          'separates_always', count(*) filter (where b.separates_money = 'always')::int,
          'pays_regular', count(*) filter (where b.pays_self = 'regularly')::int,
          'set_aside', count(*) filter (where b.set_aside)::int,
          'savings_group', count(*) filter (where b.in_savings_group)::int,
          'meal_any', count(*) filter (where b.meal_skipped in ('sometimes','often'))::int,
          'meal_often', count(*) filter (where b.meal_skipped = 'often')::int,
          'avg_good_day', round(avg(b.customers_good_day))::int,
          'avg_stock_value', round(avg(b.stock_value_kes))::int,
          'avg_profit', round(avg(b.weekly_profit_kes))::int,
          'avg_household', round(avg(b.household_size), 1),
          'avg_dependants', round(avg(b.dependants), 1),
          'children_in_school', coalesce(sum(b.children_in_school), 0)::int,
          'sales', app.tally(array_agg(b.weekly_sales_range)),
          'stage', app.tally(array_agg(b.business_stage)),
          'education', app.tally(array_agg(b.education_status)),
          'path', app.tally(array_agg(b.hoped_path)),
          'has_cv', count(*) filter (where b.has_cv)::int,
          'avg_confidence', round(avg(b.confidence), 1))
        from public.baselines b join public.enrolments e on e.id = b.enrolment_id where e.cohort_id = c.id)
    )
    -- Day 30, 60 and 90 for the adults
    || jsonb_build_object(
      'adult', coalesce((select jsonb_object_agg(v.stage::text, (
          select jsonb_build_object(
            'due',         (select count(*)::int from public.followup_schedule fs join public.enrolments e on e.id = fs.enrolment_id where e.cohort_id = c.id and fs.visit = v.stage),
            'unreachable', (select count(*)::int from public.followup_schedule fs join public.enrolments e on e.id = fs.enrolment_id where e.cohort_id = c.id and fs.visit = v.stage and fs.status = 'unreachable'),
            'n', count(*)::int,
            'operating', count(*) filter (where f.operating)::int,
            'sold14', count(*) filter (where f.sold_14_days)::int,
            'sold14_known', count(*) filter (where f.sold_14_days is not null)::int,
            'higher', count(*) filter (where f.income_vs = 'higher')::int,
            'same', count(*) filter (where f.income_vs = 'about_the_same')::int,
            'lower', count(*) filter (where f.income_vs = 'lower')::int,
            'records_daily', count(*) filter (where f.keeps_records = 'daily')::int,
            'separates_always', count(*) filter (where f.separates_money = 'always')::int,
            'pays_regular', count(*) filter (where f.pays_self in ('regularly','always'))::int,
            'set_aside', count(*) filter (where f.set_aside)::int,
            'meal_any', count(*) filter (where f.meal_skipped in ('sometimes','often'))::int,
            'meal_often', count(*) filter (where f.meal_skipped = 'often')::int,
            'growing', count(*) filter (where f.business_status = 'growing')::int,
            'stable', count(*) filter (where f.business_status = 'stable')::int,
            'struggling', count(*) filter (where f.business_status = 'struggling')::int,
            'closed', count(*) filter (where f.business_status = 'closed')::int,
            'urgent', count(*) filter (where f.urgent)::int,
            'referrals', count(*) filter (where f.referral_needed)::int,
            'support_used_yes', count(*) filter (where f.support_used = 'yes')::int,
            'support_used_partly', count(*) filter (where f.support_used = 'partly')::int,
            'avg_good_day', round(avg(f.good_day_customers))::int,
            'avg_stock_value', round(avg(f.stock_value_kes))::int,
            'avg_profit', round(avg(f.weekly_profit_kes))::int,
            'confidence', round(avg(f.confidence), 1),
            'can_continue_yes', count(*) filter (where f.can_continue in ('yes','probably'))::int,
            'recommend', count(*) filter (where f.recommend)::int,
            'sales', app.tally(array_agg(f.sales_range)),
            'challenges', app.tally(array_agg(f.challenge_category)),
            'household', (select app.tally(array_agg(h)) from public.followup_forms f2, unnest(f2.household_changes) h where f2.cohort_id = c.id and f2.stage = v.stage))
          from public.followup_forms f where f.cohort_id = c.id and f.stage = v.stage)
        ) from (values (30), (60), (90)) v(stage)), '{}'::jsonb)
    )
    -- Day 30, 60 and 90 for the youth
    || jsonb_build_object(
      'youth', coalesce((select jsonb_object_agg(v.stage::text, (
          select jsonb_build_object(
            'n', count(*)::int,
            'status', app.tally(array_agg(y.status)),
            'earning', app.tally(array_agg(y.earning_range)),
            'first_income', count(*) filter (where y.first_income)::int,
            'cv_ready', count(*) filter (where y.cv_ready)::int,
            'interviews', coalesce(sum(y.interviews), 0)::int,
            'applications', coalesce(sum(y.applications), 0)::int,
            'venture_started', count(*) filter (where y.venture_started)::int,
            'venture_operating', count(*) filter (where y.venture_operating)::int,
            'team_project_done', count(*) filter (where y.team_project_done)::int,
            'on_track', count(*) filter (where y.officer_view = 'on_track')::int,
            'needs_support', count(*) filter (where y.officer_view = 'needs_support')::int,
            'disengaged', count(*) filter (where y.officer_view = 'disengaged')::int,
            'safety', count(*) filter (where y.safety_concern)::int,
            'urgent', count(*) filter (where y.urgent)::int,
            'challenges', app.tally(array_agg(y.challenge_category)))
          from public.youth_followups y where y.cohort_id = c.id and y.stage = v.stage)
        ) from (values (30), (60), (90)) v(stage)), '{}'::jsonb)
    )
$$;

create or replace function app.cohort_impact()
returns table(cohort_id uuid, metrics jsonb) language sql stable security definer set search_path = public as $$
  with allowed as (
    select c.* from public.cohorts c
    where app.is_staff() or app.is_master_trainer() or c.id in (select app.my_cohorts())
       or (c.organisation_id in (select app.my_orgs())
           and coalesce((select a.named_participant_access <> 'none' from public.agreements a where a.organisation_id = c.organisation_id), false))
  )
  select c.id, app.cohort_metrics(c) from allowed c
$$;
grant execute on function app.cohort_impact() to authenticated;

revoke execute on function app.cohort_metrics(public.cohorts) from public, anon, authenticated;

create or replace function app.public_impact()
returns table(seq int, org_name text, org_type text, county text, start_date date, end_date date, status text, format text, small boolean, m jsonb)
language sql stable security definer set search_path = public as $$
  select c.seq, case when coalesce(a.public_listing, 'anonymous') = 'named' then o.name end, o.type, o.county, c.start_date, c.end_date, c.status, c.format,
    x.enrolled < 5,
    case when x.enrolled < 5 then jsonb_build_object('enrolled', x.enrolled) else jsonb_build_object(
      'enrolled', x.enrolled,
      'completed', (j->>'completed')::int,
      'female', case when x.enrolled >= 10 then (j->'gender'->>'female')::int end,
      'male',   case when x.enrolled >= 10 then (j->'gender'->>'male')::int end,
      'age', case when x.enrolled >= 10 then (select coalesce(jsonb_object_agg(e.k, e.v::int), '{}'::jsonb) from jsonb_each_text(coalesce(j->'age', '{}'::jsonb)) e(k, v) where e.k <> 'unknown' and e.v::int >= 3) end,
      'sessions', (j->>'sessions')::int,
      'attendance_rate', case when (j->>'sessions')::int > 0 then (j->>'attendance_rate')::int end,
      'learning', case when (j->'learning'->>'paired_n')::int >= 5 then jsonb_build_object(
          'n', (j->'learning'->>'paired_n')::int, 'pre_pct', (j->'learning'->>'pre_pct')::int, 'post_pct', (j->'learning'->>'post_pct')::int, 'gain', (j->'learning'->>'paired_gain')::int) end,
      'exit', case when (j->'exit'->>'n')::int >= 5 then jsonb_build_object(
          'n', (j->'exit'->>'n')::int, 'rating', (j->'exit'->>'rating')::numeric, 'recommend_pct', round(100.0 * (j->'exit'->>'recommend')::int / (j->'exit'->>'n')::int)::int) end,
      'baseline', case when (j->'baseline'->>'adult_n')::int >= 5 then jsonb_build_object(
          'n', (j->'baseline'->>'adult_n')::int, 'operating', (j->'baseline'->>'operating')::int,
          'records_daily', (j->'baseline'->>'records_daily')::int, 'separates_always', (j->'baseline'->>'separates_always')::int) end,
      'adult', coalesce((select jsonb_object_agg(e.k, jsonb_build_object(
          'n', (e.s->>'n')::int, 'operating', (e.s->>'operating')::int, 'sold14', (e.s->>'sold14')::int, 'sold14_known', (e.s->>'sold14_known')::int,
          'higher', (e.s->>'higher')::int, 'same', (e.s->>'same')::int, 'lower', (e.s->>'lower')::int,
          'records_daily', (e.s->>'records_daily')::int, 'separates_always', (e.s->>'separates_always')::int,
          'growing', (e.s->>'growing')::int, 'stable', (e.s->>'stable')::int, 'struggling', (e.s->>'struggling')::int, 'closed', (e.s->>'closed')::int))
        from jsonb_each(coalesce(j->'adult', '{}'::jsonb)) e(k, s) where (e.s->>'n')::int >= 5), '{}'::jsonb),
      'youth', coalesce((select jsonb_object_agg(e.k, jsonb_build_object(
          'n', (e.s->>'n')::int, 'first_income', (e.s->>'first_income')::int, 'cv_ready', (e.s->>'cv_ready')::int,
          'applications', (e.s->>'applications')::int, 'interviews', (e.s->>'interviews')::int,
          'venture_started', (e.s->>'venture_started')::int, 'venture_operating', (e.s->>'venture_operating')::int))
        from jsonb_each(coalesce(j->'youth', '{}'::jsonb)) e(k, s) where (e.s->>'n')::int >= 5), '{}'::jsonb)
    ) end
  from public.cohorts c
  join public.organisations o on o.id = c.organisation_id
  left join public.agreements a on a.organisation_id = c.organisation_id
  cross join lateral (select app.cohort_metrics(c) j) mx
  cross join lateral (select (mx.j->>'enrolled')::int enrolled) x
  where not o.is_internal and coalesce(a.public_listing, 'anonymous') <> 'hidden'
    and c.status in ('delivering', 'followup', 'closed') and x.enrolled >= 1
  order by c.seq
$$;
-- Only the server (which connects as the database owner) may call this; it carries no person check of its own.
revoke execute on function app.public_impact() from public, anon, authenticated;
