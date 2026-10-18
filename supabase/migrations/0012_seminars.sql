-- 0012: monthly participant seminars. One row per meetup, one row per sign-in or feedback form, plus the host's report. Safe to run twice.

create table if not exists public.seminars (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                 -- the short code in the public link /seminar/<code>
  title text not null,
  held_on date not null,
  venue text,
  status text not null default 'open',       -- open, closed
  host_report jsonb,                         -- filled in by the host after the day
  host_report_by uuid references public.people(id),
  host_report_at timestamptz,
  created_by uuid references public.people(id),
  created_at timestamptz not null default now()
);

create table if not exists public.seminar_entries (
  id uuid primary key default gen_random_uuid(),
  seminar_id uuid not null references public.seminars(id) on delete cascade,
  kind text not null check (kind in ('signin', 'feedback')),
  name text,
  phone text,
  email text,
  group_label text,                          -- cohort or group the person belongs to, as they wrote it
  newsletter_consent boolean not null default false,
  brevo_synced_at timestamptz,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists seminar_entries_seminar_idx on public.seminar_entries (seminar_id, kind);

alter table public.seminars enable row level security;
alter table public.seminar_entries enable row level security;
drop policy if exists sem_read on public.seminars;
create policy sem_read on public.seminars for select using (app.is_staff() or app.is_master_trainer());
drop policy if exists sem_entries_read on public.seminar_entries;
create policy sem_entries_read on public.seminar_entries for select using (app.is_staff() or app.is_master_trainer());

grant select on public.seminars, public.seminar_entries to authenticated;
