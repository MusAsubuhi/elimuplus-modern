-- 0047: training calendar.
-- 1) A private feed address for each person, so their phone calendar can show the trainings they may see.
-- 2) Founders' confirmation that two trainings on the same days will be covered by different trainers.
-- Safe to run twice.

create table if not exists public.calendar_feeds (
  person_id   uuid primary key references public.people(id) on delete cascade,
  token       text not null unique check (length(token) >= 32),
  created_at  timestamptz not null default now(),
  last_read_at timestamptz
);

-- Two trainings that overlap and have different trainers can run together once a founder has checked each trainer and venue.
-- The pair is stored in a fixed order (cohort_a < cohort_b) so each pair has one row.
create table if not exists public.calendar_clash_confirmations (
  cohort_a      uuid not null references public.cohorts(id) on delete cascade,
  cohort_b      uuid not null references public.cohorts(id) on delete cascade,
  confirmed_by  uuid references public.people(id) on delete set null,
  confirmed_at  timestamptz not null default now(),
  note          text,
  primary key (cohort_a, cohort_b),
  check (cohort_a < cohort_b)
);

alter table public.calendar_feeds enable row level security;
alter table public.calendar_clash_confirmations enable row level security;

-- The feed address is private to its owner. The feed itself is served by the server, which looks the address up directly.
drop policy if exists cf_feed_own on public.calendar_feeds;
create policy cf_feed_own on public.calendar_feeds for all to authenticated using (person_id = app.me()) with check (person_id = app.me());

-- Founders confirm and change; trainers who can see the training can see that it was confirmed.
drop policy if exists ccc_founders on public.calendar_clash_confirmations;
create policy ccc_founders on public.calendar_clash_confirmations for all to authenticated using (app.is_founder()) with check (app.is_founder());
drop policy if exists ccc_read on public.calendar_clash_confirmations;
create policy ccc_read on public.calendar_clash_confirmations for select to authenticated using (
  cohort_a in (select app.my_cohorts()) or cohort_b in (select app.my_cohorts()));

grant select, insert, update, delete on public.calendar_feeds to authenticated;
grant select, insert, update, delete on public.calendar_clash_confirmations to authenticated;
