-- 0024: one view over the baseline and every follow-up, on the same standard measures, so change over time is a single query.
-- It reads through the same row level security as the tables underneath (security_invoker), so it shows nobody more than they could already see.

create or replace view public.outcome_measures with (security_invoker = true) as
  select b.enrolment_id, e.cohort_id, 0 as stage, b.kind::text as kind, coalesce(b.captured_on, b.created_at::date) as measured_on,
         null::boolean as operating, b.business_stage::text as business_status, b.weekly_profit_kes, b.weekly_sales_range::text as earnings_text,
         b.keeps_records::text, b.separates_money::text, b.pays_self::text, b.set_aside, b.meal_skipped::text, b.confidence,
         null::text as income_vs, null::boolean as first_income, 'baseline'::text as source
  from public.baselines b join public.enrolments e on e.id = b.enrolment_id
  union all
  select f.enrolment_id, f.cohort_id, f.stage, 'adult', f.visited_on,
         f.operating, f.business_status::text, f.weekly_profit_kes, f.sales_range::text,
         f.keeps_records::text, f.separates_money::text, f.pays_self::text, f.set_aside, f.meal_skipped::text, f.confidence,
         f.income_vs::text, null::boolean, 'followup'
  from public.followup_forms f
  union all
  select y.enrolment_id, y.cohort_id, y.stage, 'youth', y.visited_on,
         y.venture_operating, y.status::text, null::int, y.earning_range::text,
         null::text, null::text, null::text, null::boolean, null::text, null::int,
         null::text, y.first_income, 'followup'
  from public.youth_followups y;

grant select on public.outcome_measures to authenticated;
