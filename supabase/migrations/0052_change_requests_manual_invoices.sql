-- 1. Partners ask for changes to a training they booked; someone at Elimu+ approves or denies.
create table if not exists public.cohort_change_requests (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id),
  requested_by uuid references public.people(id),
  changes jsonb not null,            -- only the fields being asked for: name, start_date, venue, audience, language, expected_participants
  before jsonb not null,             -- what they were when the request was made
  reason text not null,
  late boolean not null default false, -- asked for close to, or after, the start date
  status text not null default 'pending' check (status in ('pending','approved','denied','withdrawn')),
  decided_by uuid references public.people(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create unique index if not exists ccr_one_pending on public.cohort_change_requests (cohort_id) where status = 'pending';
create index if not exists ccr_org on public.cohort_change_requests (organisation_id, created_at desc);
alter table public.cohort_change_requests enable row level security;
drop policy if exists ccr_read on public.cohort_change_requests;
create policy ccr_read on public.cohort_change_requests for select using (app.is_staff() or organisation_id in (select app.my_org_admin_orgs()));
drop policy if exists ccr_insert on public.cohort_change_requests;
create policy ccr_insert on public.cohort_change_requests for insert with check (status = 'pending' and organisation_id in (select app.my_org_admin_orgs()));
drop policy if exists ccr_write on public.cohort_change_requests;
create policy ccr_write on public.cohort_change_requests for all using (app.is_founder()) with check (app.is_founder());

-- 2. Invoices and payments added by hand for work done before the portal existed.
alter table public.invoices add column if not exists manual boolean not null default false;
alter table public.invoices add column if not exists manual_note text;
