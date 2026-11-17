-- System feedback: short, choice-only questions asked of partners and trainers once they have really used the portal.
-- Founders never read individual answers. They read totals through app.feedback_summary(), and a group is only shown when
-- at least three people answered, so no one can be picked out.

-- How long and how often each person has used the portal (one row per person; one count per day they open it).
create table if not exists public.portal_usage (
  person_id uuid primary key references public.people(id) on delete cascade,
  first_seen_on date not null default (now() at time zone 'Africa/Nairobi')::date,
  last_seen_on date not null default (now() at time zone 'Africa/Nairobi')::date,
  visit_days int not null default 1,
  snooze_until date
);
alter table public.portal_usage enable row level security;
create policy pu_read on public.portal_usage for select using (person_id = app.me());
grant select on public.portal_usage to authenticated;

-- People who already have accounts start counting from the day their account was made, with no visits yet.
insert into public.portal_usage (person_id, first_seen_on, last_seen_on, visit_days)
select p.id, (p.created_at at time zone 'Africa/Nairobi')::date, (p.created_at at time zone 'Africa/Nairobi')::date, 0
from public.people p on conflict (person_id) do nothing;

create table if not exists public.system_feedback (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  audience text not null check (audience in ('partner','trainer')),
  round int not null default 1,
  ease int not null check (ease between 1 and 5),
  recommend int not null check (recommend between 0 and 10),
  valuable text[] not null default '{}' check (cardinality(valuable) <= 3),
  frustration text,
  missing text,
  tenure_days int not null default 0,
  visits int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists system_feedback_person on public.system_feedback(person_id, created_at desc);
alter table public.system_feedback enable row level security;
-- A person can add their own answer and see that they have answered. Nobody else, founders included, can read rows.
create policy sf_insert on public.system_feedback for insert with check (person_id = app.me());
create policy sf_own on public.system_feedback for select using (person_id = app.me());
grant select, insert on public.system_feedback to authenticated;

-- Totals for the founders. Everything is counted; nothing identifies a person. Groups under 3 answers come back empty.
create or replace function app.feedback_summary()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if not app.is_founder() then raise exception 'founders only'; end if;
  with f as (select * from public.system_feedback),
  grp as (select 'all'::text g, * from f union all select audience, * from f),
  stats as (
    select g, count(*)::int n, round(avg(ease), 2) ease_avg,
      count(*) filter (where recommend >= 9)::int promoters,
      count(*) filter (where recommend between 7 and 8)::int passives,
      count(*) filter (where recommend <= 6)::int detractors,
      round(avg(tenure_days))::int avg_tenure, round(avg(visits))::int avg_visits,
      jsonb_build_object('1', count(*) filter (where ease = 1), '2', count(*) filter (where ease = 2), '3', count(*) filter (where ease = 3),
                         '4', count(*) filter (where ease = 4), '5', count(*) filter (where ease = 5)) ease_dist
    from grp group by g
  ),
  val as (select g, jsonb_object_agg(v, c) j from (select g, v, count(*)::int c from grp, unnest(valuable) v group by g, v) x group by g),
  fru as (select g, jsonb_object_agg(frustration, c) j from (select g, frustration, count(*)::int c from grp where frustration is not null group by g, frustration) x group by g),
  mis as (select g, jsonb_object_agg(missing, c) j from (select g, missing, count(*)::int c from grp where missing is not null group by g, missing) x group by g),
  one as (
    select s.g, jsonb_build_object('n', s.n, 'ease_avg', s.ease_avg, 'ease_dist', s.ease_dist, 'promoters', s.promoters, 'passives', s.passives,
      'detractors', s.detractors, 'nps', round(100.0 * (s.promoters - s.detractors) / s.n)::int, 'avg_tenure', s.avg_tenure, 'avg_visits', s.avg_visits,
      'valuable', coalesce(v.j, '{}'::jsonb), 'frustration', coalesce(fr.j, '{}'::jsonb), 'missing', coalesce(m.j, '{}'::jsonb)) j
    from stats s left join val v using (g) left join fru fr using (g) left join mis m using (g)
    where s.n >= 3
  ),
  tenure as (
    select band, count(*)::int n, round(avg(ease), 2) ease_avg from (
      select ease, case when tenure_days < 30 then 'First month' when tenure_days < 90 then '1 to 3 months' else 'Over 3 months' end band from f) x
    group by band having count(*) >= 3
  ),
  rounds as (select round, count(*)::int n, round(avg(ease), 2) ease_avg from f group by round having count(*) >= 3),
  eligible as (
    select p.id, case when exists (select 1 from public.role_assignments r where r.person_id = p.id and r.status = 'active' and r.role in ('facilitator','trainer_candidate')) then 'trainer'
                      else 'partner' end audience
    from public.people p
    join public.portal_usage u on u.person_id = p.id
    where p.status = 'active' and u.visit_days >= 5 and (now() at time zone 'Africa/Nairobi')::date - u.first_seen_on >= 14
      and not exists (select 1 from public.role_assignments r where r.person_id = p.id and r.status = 'active' and r.role in ('founder','staff'))
      and exists (select 1 from public.role_assignments r where r.person_id = p.id and r.status = 'active' and r.role in ('facilitator','trainer_candidate','org_admin','org_viewer'))
  )
  select jsonb_build_object(
    'overall', (select j from one where g = 'all'),
    'partner', (select j from one where g = 'partner'),
    'trainer', (select j from one where g = 'trainer'),
    'responses', (select count(*)::int from f),
    'eligible', jsonb_build_object('partner', (select count(*)::int from eligible where audience = 'partner'), 'trainer', (select count(*)::int from eligible where audience = 'trainer')),
    'answered', jsonb_build_object('partner', (select count(distinct person_id)::int from f where audience = 'partner'), 'trainer', (select count(distinct person_id)::int from f where audience = 'trainer')),
    'by_tenure', coalesce((select jsonb_agg(jsonb_build_object('band', band, 'n', n, 'ease_avg', ease_avg)) from tenure), '[]'::jsonb),
    'by_round', coalesce((select jsonb_agg(jsonb_build_object('round', round, 'n', n, 'ease_avg', ease_avg) order by round) from rounds), '[]'::jsonb)
  ) into out;
  return out;
end $$;
grant execute on function app.feedback_summary() to authenticated;
