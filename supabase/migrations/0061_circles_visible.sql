-- Who can see a circle is decided by the circles policy; the mentor's name has to travel with it, but the mentors table itself
-- (phone, vetting notes) stays readable only by founders and the mentor. This function returns the safe columns for visible circles.
create or replace function app.circles_visible() returns table(
  id uuid, cohort_id uuid, cohort_name text, name text, focus text, status text, has_minors boolean, place text,
  partner_rep_name text, partner_rep_phone text, start_date date, mentor_id uuid, mentor_name text, mentor_person uuid,
  members int, held int, next_on date)
language sql stable security definer set search_path = public as $$
  select c.id, c.cohort_id, co.name, c.name, c.focus, c.status, c.has_minors, c.place, c.partner_rep_name, c.partner_rep_phone, c.start_date,
    m.id, m.full_name, m.person_id,
    (select count(*)::int from public.circle_members x where x.circle_id = c.id and x.status = 'active'),
    (select count(*)::int from public.circle_meetings t where t.circle_id = c.id and t.status = 'held'),
    (select min(t.held_on) from public.circle_meetings t where t.circle_id = c.id and t.status = 'planned' and t.held_on >= (now() at time zone 'Africa/Nairobi')::date)
  from public.mentoring_circles c
  join public.cohorts co on co.id = c.cohort_id
  join public.mentors m on m.id = c.mentor_id
  where app.is_founder() or c.id in (select app.my_circles())
     or c.cohort_id in (select x.id from public.cohorts x where x.organisation_id in (select app.my_orgs()))
$$;
grant execute on function app.circles_visible() to authenticated;
