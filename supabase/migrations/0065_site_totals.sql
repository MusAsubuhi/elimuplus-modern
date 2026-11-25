-- Site totals: one public feed of headline numbers so elimuplus.com stops relying on hand-edited counts.
-- 1. Cohorts that ran before the portal existed (Youth 1 and Adult 1 to 3) are kept as plain counts: no names, no people records.
-- 2. app.public_site_totals() adds those to the live portal cohorts and enrolments. Numbers only.

create table if not exists public.historical_cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  organisation_id uuid references public.organisations(id),
  audience text not null check (audience in ('Youth','Adults')),
  period text not null,                         -- e.g. 'Spring 2026'
  people_counted int not null check (people_counted >= 0),  -- completers, the basis the website has always used
  note text,
  created_at timestamptz not null default now()
);
alter table public.historical_cohorts enable row level security;
create policy hc_founder on public.historical_cohorts for all using (app.is_founder()) with check (app.is_founder());
grant select, insert, update, delete on public.historical_cohorts to authenticated;

insert into public.historical_cohorts (name, organisation_id, audience, period, people_counted, note)
select v.name, o.id, v.audience, v.period, v.n, v.note
from (values
  ('Youth Cohort 1 (2025)', 'Youth', '2025, school holidays', 15, '15 took part; all completed and received certificates.'),
  ('Adult Cohort 1 (2026)', 'Adults', 'Spring 2026', 10, '10 women completed.'),
  ('Adult Cohort 2 (2026)', 'Adults', 'May 2026', 8, '9 enrolled, 8 completed; taught in Swahili.'),
  ('Adult Cohort 3 (2026)', 'Adults', 'September 2026', 9, '12 attended, 9 came all five days of the 5-Day Crush.')
) v(name, audience, period, n, note)
cross join (select id from public.organisations where name ilike '%KE0358%' or name ilike '%KE358%' order by created_at limit 1) o
on conflict (name) do nothing;

create or replace function app.public_site_totals() returns jsonb language sql stable security definer set search_path = public as $$
  with live as (
    select c.id, c.organisation_id from public.cohorts c
     where c.name not ilike 'founders%' and c.start_date is not null and c.start_date <= current_date
  ), ke as (select id from public.organisations where name ilike '%KE0358%' or name ilike '%KE358%')
  select jsonb_build_object(
    'as_of', current_date,
    'cohorts', (select count(*) from live) + (select count(*) from public.historical_cohorts),
    'ke358_cohorts', (select count(*) from live where organisation_id in (select id from ke))
                   + (select count(*) from public.historical_cohorts where organisation_id in (select id from ke)),
    'people', (select count(*) from public.enrolments e where e.cohort_id in (select id from live) and e.status not in ('withdrawn','dropped','cancelled'))
            + (select coalesce(sum(people_counted),0) from public.historical_cohorts)
  )
$$;
revoke all on function app.public_site_totals() from public, anon, authenticated;
