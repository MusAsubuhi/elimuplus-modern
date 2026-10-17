-- Impact data: who the participants are, where they start (Day 0 baseline), what they learn, how they finish,
-- and how they are doing afterwards. Everything the partner and funder questions need, in typed columns that can be
-- counted, compared and shown on the portal. Free text and the raw form answers are kept alongside as written.
--
-- Safe to run more than once. Nothing here changes or removes existing data.

-- ---------- small helpers ----------
create or replace function app.to_int(t text) returns int language plpgsql immutable as $$
declare c text := regexp_replace(coalesce(t, ''), '[^0-9.]', '', 'g');
begin
  if c ~ '^[0-9]{1,9}(\.[0-9]+)?$' then return round(c::numeric)::int; end if;
  return null;
end $$;

-- "Not yet" -> not_yet, "About the same" -> about_the_same: one spelling for every answer that came from a form choice.
create or replace function app.code(t text) returns text language sql immutable as $$
  select nullif(trim(both '_' from regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '_', 'g')), '')
$$;

-- Counts of each value in a list, as {"value": n}. Blank and null values are ignored.
create or replace function app.tally(vals text[]) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(v, n), '{}'::jsonb)
  from (select v, count(*)::int n from unnest(vals) v where v is not null and v <> '' group by v) t
$$;

-- ---------- who they are ----------
alter table public.people
  add column if not exists gender text check (gender in ('female','male','other','undisclosed')),
  add column if not exists has_disability boolean;

alter table public.enrolments
  add column if not exists partner_ref text,            -- the partner's own reference, for example a CDC child or family number
  add column if not exists guardian_name text,
  add column if not exists guardian_phone text,
  add column if not exists guardian_consent boolean,
  add column if not exists story_consent text check (story_consent in ('named','anonymous','none')),
  add column if not exists photo_consent boolean,
  add column if not exists consented_on date,
  add column if not exists exit_reason text,
  add column if not exists exit_note text,
  add column if not exists exited_on date;

-- ---------- Day 0 baseline: one per participant, adult (caregiver) or youth ----------
create table if not exists public.baselines (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null unique references public.enrolments(id) on delete cascade,
  kind text not null check (kind in ('adult','youth')),
  captured_on date not null default current_date,
  officer_id uuid references public.people(id),
  officer_text text,
  -- the business (adults)
  business_stage text,                -- running, starting, idea
  business_type text,
  days_open int,
  customers_good_day int,
  customers_slow_day int,
  weekly_sales_range text,            -- same bands as the follow-up form so Day 0 and Day 90 compare directly
  weekly_profit_kes int,
  restock_range text,
  stock_level text,
  stock_value_kes int,
  keeps_records text,                 -- daily, sometimes, no
  separates_money text,               -- always, sometimes, not_yet
  pays_self text,                     -- regularly, sometimes, not_yet
  set_aside boolean,
  in_savings_group boolean,
  -- the household (adults)
  household_size int,
  dependants int,
  children_in_school int,
  meal_skipped text,                  -- no, sometimes, often (in the past week)
  income_sources text[] not null default '{}',
  support_promised text,
  support_promised_kes int,
  -- the young person (youth)
  education_status text,              -- in_school, out_of_school, in_college, working, self_employed, looking_for_work
  school_class text,
  has_cv boolean,
  prior_work text,
  hoped_path text,                    -- employment, own_business, both, not_sure
  digital_access text[] not null default '{}',
  skills_self jsonb not null default '{}'::jsonb,   -- self-rating 1 to 5 per skill
  -- both
  confidence int check (confidence between 1 and 5),
  main_challenge text,
  challenge_category text,
  hope_words text,
  answers jsonb not null default '{}'::jsonb,
  response_id text unique,
  created_at timestamptz not null default now()
);

-- ---------- learning check at the start and end of the programme ----------
create table if not exists public.learning_checks (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null references public.enrolments(id) on delete cascade,
  stage text not null check (stage in ('pre','post')),
  taken_on date not null default current_date,
  score int not null,
  out_of int not null,
  confidence int check (confidence between 1 and 5),
  answers jsonb not null default '{}'::jsonb,
  response_id text unique,
  created_at timestamptz not null default now(),
  unique (enrolment_id, stage)
);

-- ---------- end-of-programme feedback, asked on the last training day ----------
create table if not exists public.exit_feedback (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null unique references public.enrolments(id) on delete cascade,
  given_on date not null default current_date,
  rating int check (rating between 1 and 5),
  confidence int check (confidence between 1 and 5),
  recommend boolean,
  most_useful text,
  least_useful text,
  change_suggestion text,
  first_step text,
  support_needed text[] not null default '{}',
  concern boolean not null default false,
  concern_note text,
  answers jsonb not null default '{}'::jsonb,
  response_id text unique,
  created_at timestamptz not null default now()
);

-- ---------- youth follow-up at 30, 60 and 90 days ----------
create table if not exists public.youth_followups (
  id uuid primary key default gen_random_uuid(),
  stage int not null check (stage in (30,60,90)),
  cohort_id uuid references public.cohorts(id),
  enrolment_id uuid references public.enrolments(id) on delete set null,
  officer_id uuid references public.people(id),
  officer_text text,
  participant_name text not null,
  participant_phone text,
  visited_on date not null default current_date,
  status text,                        -- employed, self_employed, internship, studying, looking_for_work, none
  earning_range text,                 -- income in the last month
  first_income boolean,
  cv_ready boolean,
  applications int,
  interviews int,
  venture_started boolean,
  venture_operating boolean,
  team_project_done boolean,
  skills_used text[] not null default '{}',
  challenge_category text,
  challenge_words text,
  support_needed text[] not null default '{}',
  safety_concern boolean not null default false,
  officer_view text,                  -- on_track, needs_support, disengaged
  urgent boolean not null default false,
  next_step text,
  story_consent text,
  answers jsonb not null default '{}'::jsonb,
  response_id text unique,
  routed_to uuid references public.people(id),
  source text not null default 'google_form',
  created_at timestamptz not null default now()
);
create index if not exists youth_followups_cohort on public.youth_followups(cohort_id, stage);
create index if not exists youth_followups_enrolment on public.youth_followups(enrolment_id);

-- ---------- the adult follow-up: promote the answers that get counted into columns ----------
alter table public.followup_forms
  add column if not exists sold_14_days boolean,
  add column if not exists days_open int,
  add column if not exists good_day_customers int,
  add column if not exists slow_day_customers int,
  add column if not exists restock_range text,
  add column if not exists exact_sales_kes int,
  add column if not exists weekly_profit_kes int,
  add column if not exists income_vs text,              -- higher, about_the_same, lower, not_sure
  add column if not exists keeps_records text,
  add column if not exists separates_money text,
  add column if not exists pays_self text,
  add column if not exists set_aside boolean,
  add column if not exists saves_weekly text,
  add column if not exists home_use text,
  add column if not exists meal_skipped text,
  add column if not exists knows_breakeven text,
  add column if not exists tracks_key_number boolean,
  add column if not exists used_calc boolean,
  add column if not exists confidence int,
  add column if not exists referral_needed boolean,
  add column if not exists challenge_category text,
  add column if not exists challenge_words text,
  add column if not exists support_used text,           -- yes, partly, no
  add column if not exists can_continue text,           -- Day 90: yes, probably, not_sure, no
  add column if not exists household_changes text[] not null default '{}',
  add column if not exists in_savings_group boolean,
  add column if not exists recommend boolean,
  add column if not exists story_consent text,
  add column if not exists next_step text;

-- Fill the new columns for visits already recorded, from the answers kept as written.
update public.followup_forms f set
  days_open          = coalesce(f.days_open, app.to_int(f.answers->>'a1_days_open')),
  good_day_customers = coalesce(f.good_day_customers, app.to_int(f.answers->>'a2_good_day')),
  slow_day_customers = coalesce(f.slow_day_customers, app.to_int(f.answers->>'a2_slow_day')),
  restock_range      = coalesce(f.restock_range, f.answers->>'a4_restock_range'),
  exact_sales_kes    = coalesce(f.exact_sales_kes, app.to_int(f.answers->>'a4_exact_sales')),
  weekly_profit_kes  = coalesce(f.weekly_profit_kes, app.to_int(f.answers->>'a4_profit')),
  income_vs          = coalesce(f.income_vs, app.code(f.answers->>'a4_compare')),
  keeps_records      = coalesce(f.keeps_records, app.code(f.answers->>'a5_records')),
  separates_money    = coalesce(f.separates_money, app.code(coalesce(f.answers->>'habit_separate', f.answers->>'a5_separate'))),
  pays_self          = coalesce(f.pays_self, app.code(f.answers->>'a5_pays_self')),
  set_aside          = coalesce(f.set_aside, case f.answers->>'a4_set_aside' when 'Yes' then true when 'Not enough' then false end),
  home_use           = coalesce(f.home_use, app.code(f.answers->>'a5_home_use')),
  meal_skipped       = coalesce(f.meal_skipped, app.code(f.answers->>'a6_meal')),
  referral_needed    = coalesce(f.referral_needed, case f.answers->>'a6_referral' when 'Yes' then true when 'No' then false end),
  challenge_category = coalesce(f.challenge_category, app.code(f.answers->>'a7_category')),
  challenge_words    = coalesce(f.challenge_words, nullif(left(f.answers->>'a7_words', 1000), '')),
  support_used       = coalesce(f.support_used, app.code(f.answers->>'b4_used')),
  can_continue       = coalesce(f.can_continue, app.code(f.answers->>'b1_continue')),
  recommend          = coalesce(f.recommend, case f.answers->>'b5_recommend' when 'Yes' then true when 'No' then false end),
  next_step          = coalesce(f.next_step, nullif(left(f.answers->>'b6_next', 300), ''))
where f.answers <> '{}'::jsonb;

-- ---------- who can read the new tables ----------
-- Rows arrive only through the trusted forms endpoint, so there are no insert policies for signed-in users.
create or replace function app.enrolment_visible(en uuid) returns boolean language sql stable security definer set search_path = public as $$
  select app.is_staff() or app.is_master_trainer()
    or exists (select 1 from public.enrolments e where e.id = en
       and (e.person_id = app.me() or e.cohort_id in (select app.my_cohorts()) or app.cohort_sees_named(e.cohort_id)))
$$;

alter table public.baselines enable row level security;
alter table public.learning_checks enable row level security;
alter table public.exit_feedback enable row level security;
alter table public.youth_followups enable row level security;

drop policy if exists bl_read on public.baselines;
create policy bl_read on public.baselines for select using (app.enrolment_visible(enrolment_id));
drop policy if exists lc_read on public.learning_checks;
create policy lc_read on public.learning_checks for select using (app.enrolment_visible(enrolment_id));
drop policy if exists xf_read on public.exit_feedback;
create policy xf_read on public.exit_feedback for select using (app.enrolment_visible(enrolment_id));
drop policy if exists yf_read on public.youth_followups;
create policy yf_read on public.youth_followups for select using (
  app.is_staff() or app.is_master_trainer() or officer_id = app.me() or routed_to = app.me()
  or (enrolment_id is not null and app.enrolment_visible(enrolment_id)));

grant select on public.baselines, public.learning_checks, public.exit_feedback, public.youth_followups to authenticated;

-- A founder alert for every youth visit; urgent or safety-related ones are marked urgent.
create or replace function app.tr_alert_youth_followup() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform app.raise_alert('youth_followups',
    case when new.urgent or new.safety_concern then 'urgent' when new.officer_view in ('needs_support','disengaged') then 'attention' else 'info' end,
    'Youth Day ' || new.stage || ' follow-up: ' || new.participant_name || coalesce(' (' || replace(new.officer_view, '_', ' ') || ')', ''),
    nullif(left(coalesce(new.challenge_words, ''), 300), ''),
    '/portal/cohorts' || coalesce('/' || new.cohort_id::text, ''), 'youth_followups', new.id);
  return new;
end $$;
drop trigger if exists alert_youth_followups on public.youth_followups;
create trigger alert_youth_followups after insert on public.youth_followups for each row execute function app.tr_alert_youth_followup();

-- ---------- results for each cohort, as totals only ----------
-- One row per cohort the caller may see. Staff and trainers of the cohort see their own cohorts; a partner sees its cohorts
-- when its agreement shares at least totals. No names or contact details are returned, so this is safe for aggregate-only partners.
create or replace function app.cohort_impact()
returns table(cohort_id uuid, metrics jsonb) language sql stable security definer set search_path = public as $$
  with allowed as (
    select c.* from public.cohorts c
    where app.is_staff() or app.is_master_trainer() or c.id in (select app.my_cohorts())
       or (c.organisation_id in (select app.my_orgs())
           and coalesce((select a.named_participant_access <> 'none' from public.agreements a where a.organisation_id = c.organisation_id), false))
  )
  select c.id,
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
  from allowed c
$$;
grant execute on function app.cohort_impact() to authenticated;
