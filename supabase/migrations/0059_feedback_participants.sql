-- Participants are asked too. Same privacy rules: totals only, groups under 3 hidden.
alter table public.system_feedback drop constraint if exists system_feedback_audience_check;
alter table public.system_feedback add constraint system_feedback_audience_check check (audience in ('partner','trainer','founder','participant'));

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
    select p.id, case when exists (select 1 from public.role_assignments r where r.person_id = p.id and r.status = 'active' and r.role = 'founder') then 'founder'
                      when exists (select 1 from public.role_assignments r where r.person_id = p.id and r.status = 'active' and r.role in ('facilitator','trainer_candidate')) then 'trainer'
                      when exists (select 1 from public.role_assignments r where r.person_id = p.id and r.status = 'active' and r.role in ('org_admin','org_viewer')) then 'partner'
                      else 'participant' end audience
    from public.people p
    join public.portal_usage u on u.person_id = p.id
    where p.status = 'active' and u.visit_days >= 5 and (now() at time zone 'Africa/Nairobi')::date - u.first_seen_on >= 14
      and exists (select 1 from public.role_assignments r where r.person_id = p.id and r.status = 'active' and r.role in ('founder','facilitator','trainer_candidate','org_admin','org_viewer','participant'))
  )
  select jsonb_build_object(
    'overall', (select j from one where g = 'all'),
    'partner', (select j from one where g = 'partner'),
    'trainer', (select j from one where g = 'trainer'),
    'founder', (select j from one where g = 'founder'),
    'participant', (select j from one where g = 'participant'),
    'responses', (select count(*)::int from f),
    'eligible', jsonb_build_object('partner', (select count(*)::int from eligible where audience = 'partner'), 'trainer', (select count(*)::int from eligible where audience = 'trainer'), 'founder', (select count(*)::int from eligible where audience = 'founder'), 'participant', (select count(*)::int from eligible where audience = 'participant')),
    'answered', jsonb_build_object('partner', (select count(distinct person_id)::int from f where audience = 'partner'), 'trainer', (select count(distinct person_id)::int from f where audience = 'trainer'), 'founder', (select count(distinct person_id)::int from f where audience = 'founder'), 'participant', (select count(distinct person_id)::int from f where audience = 'participant')),
    'by_tenure', coalesce((select jsonb_agg(jsonb_build_object('band', band, 'n', n, 'ease_avg', ease_avg)) from tenure), '[]'::jsonb),
    'by_round', coalesce((select jsonb_agg(jsonb_build_object('round', round, 'n', n, 'ease_avg', ease_avg) order by round) from rounds), '[]'::jsonb)
  ) into out;
  return out;
end $$;
grant execute on function app.feedback_summary() to authenticated;
