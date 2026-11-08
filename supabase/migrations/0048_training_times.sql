-- 0048: the daily time of a training (for example 09:00 to 16:00), agreed with the client.
-- A founder or a lead or co-facilitator of that training can set it. Everyone who can see the training sees the time.
-- Trainers cannot edit cohorts directly, so the change goes through one narrow function that checks who is asking.
-- Safe to run twice.

alter table public.cohorts add column if not exists daily_start time;
alter table public.cohorts add column if not exists daily_end time;
alter table public.cohorts add column if not exists time_note text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cohorts_daily_time_ok') then
    alter table public.cohorts add constraint cohorts_daily_time_ok check (
      (daily_start is null and daily_end is null) or (daily_start is not null and daily_end is not null and daily_end > daily_start));
  end if;
end $$;

create or replace function app.set_training_time(p_cohort uuid, p_start time, p_end time, p_note text)
returns void language plpgsql security definer set search_path = public, app as $$
begin
  if not (app.is_founder() or exists (
    select 1 from public.cohort_facilitators cf
    where cf.cohort_id = p_cohort and cf.person_id = app.me() and cf.role in ('lead', 'co'))) then
    raise exception 'Only a founder or the lead or co-facilitator of this training can set its time';
  end if;
  if (p_start is null) <> (p_end is null) then raise exception 'Give both a start time and an end time, or leave both empty'; end if;
  if p_start is not null and p_end <= p_start then raise exception 'The end time must be after the start time'; end if;
  update public.cohorts set daily_start = p_start, daily_end = p_end, time_note = left(nullif(btrim(p_note), ''), 200) where id = p_cohort;
end $$;

revoke all on function app.set_training_time(uuid, time, time, text) from public;
grant execute on function app.set_training_time(uuid, time, time, text) to authenticated;
