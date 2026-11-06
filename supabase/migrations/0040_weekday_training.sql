-- Training is never held on a Saturday or Sunday: the end date and the dates of each training day skip weekends.
create or replace function app.add_training_days(start date, n int) returns date language plpgsql immutable as $$
declare d date := start; k int := 1;
begin
  while extract(isodow from d) >= 6 loop d := d + 1; end loop;
  while k < n loop
    d := d + 1;
    if extract(isodow from d) < 6 then k := k + 1; end if;
  end loop;
  return d;
end $$;

create or replace function app.set_cohort_end() returns trigger language plpgsql as $$
begin
  if new.start_date is not null and new.end_date is null then
    new.end_date := app.add_training_days(new.start_date, case when new.format = '12-day' then 12 else 5 end);
  end if;
  return new;
end $$;

-- Cohorts whose end date was only the start plus 4 or 11 calendar days are recomputed; any end date a founder chose differently is left alone.
update public.cohorts set end_date = app.add_training_days(start_date, case when format = '12-day' then 12 else 5 end)
  where start_date is not null and end_date in (start_date + 4, start_date + 11);

-- Days not yet held are moved off weekends. Days already held keep the date they were run on.
update public.sessions s set session_date = app.add_training_days(c.start_date, s.day_number)
  from public.cohorts c
  where c.id = s.cohort_id and c.start_date is not null and s.attendance_confirmed_at is null
    and s.session_date is distinct from app.add_training_days(c.start_date, s.day_number);
