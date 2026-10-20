-- 0027: a record of every report an organisation downloaded or sent from the portal, so it is always clear what left, in what form and to whom.
-- The reports themselves are built on demand from aggregate results; nothing about individual participants is stored here.
-- Organisation admins record their own organisation's exports; founders can read all of them. A record is never edited or deleted.
-- Safe to run twice.

create table if not exists public.report_exports (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  created_by      uuid not null references public.people(id) on delete restrict,
  title           text not null,
  cohort_ids      uuid[] not null default '{}',
  sections        text[] not null default '{}',
  format          text not null check (format in ('pdf','csv')),
  action          text not null check (action in ('download','email')),
  recipients      text[] not null default '{}',
  message         text,
  status          text not null check (status in ('downloaded','sent','failed','not_configured')),
  error           text,
  created_at      timestamptz not null default now(),
  check (action <> 'email' or coalesce(array_length(recipients, 1), 0) > 0)
);
create index if not exists report_exports_org on public.report_exports(organisation_id, created_at desc);

alter table public.report_exports enable row level security;

drop policy if exists re_read on public.report_exports;
create policy re_read on public.report_exports for select using (organisation_id in (select app.my_orgs()) or app.is_founder());

-- Always recorded under the real author, and only for an organisation the person administers (or by a founder).
drop policy if exists re_insert on public.report_exports;
create policy re_insert on public.report_exports for insert with check (
  created_by = app.me() and (organisation_id in (select app.my_org_admin_orgs()) or app.is_founder()));
-- No update or delete policy on purpose: this is a record.

grant select, insert on public.report_exports to authenticated;
