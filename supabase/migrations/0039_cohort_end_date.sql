-- A cohort always has an end date: the start date plus 4 days (5-Day) or 11 days (12-Day) unless a founder sets another.
create or replace function app.set_cohort_end() returns trigger language plpgsql as $$
begin
  if new.start_date is not null and new.end_date is null then
    new.end_date := new.start_date + (case when new.format = '12-day' then 11 else 4 end);
  end if;
  return new;
end $$;
drop trigger if exists cohort_end_date on public.cohorts;
create trigger cohort_end_date before insert or update of start_date, end_date, format on public.cohorts
  for each row execute function app.set_cohort_end();
update public.cohorts set end_date = start_date + (case when format = '12-day' then 11 else 4 end)
  where end_date is null and start_date is not null;
