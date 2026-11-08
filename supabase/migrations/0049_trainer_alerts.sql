-- 0049: a notice for a trainer when a founder puts them on a training (or changes their role on it).
-- Each person reads and marks only their own. The portal writes them with its service role when the assignment is saved.
-- Safe to run twice.

create table if not exists public.trainer_alerts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  cohort_id uuid references public.cohorts(id) on delete cascade,
  kind text not null default 'assigned',
  title text not null,
  body text,
  link text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  emailed_at timestamptz,
  email_error text
);
create index if not exists trainer_alerts_person on public.trainer_alerts(person_id, created_at desc);
alter table public.trainer_alerts enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'trainer_alerts' and policyname = 'ta_read') then
    create policy ta_read on public.trainer_alerts for select using (person_id = app.me());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'trainer_alerts' and policyname = 'ta_mark') then
    create policy ta_mark on public.trainer_alerts for update using (person_id = app.me()) with check (person_id = app.me());
  end if;
end $$;

grant select on public.trainer_alerts to authenticated;
grant update (read_at) on public.trainer_alerts to authenticated;
