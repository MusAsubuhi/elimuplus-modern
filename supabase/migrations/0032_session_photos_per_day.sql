-- Up to five photos for each training day (was one a day, five a cohort).
alter table public.session_photos drop constraint if exists session_photos_cohort_id_day_number_key;
create or replace function app.guard_session_photos() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.session_photos where cohort_id = new.cohort_id and day_number = new.day_number) >= 5 then
    raise exception 'A training day can have at most five session photos';
  end if;
  return new;
end $$;
