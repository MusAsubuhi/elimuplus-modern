-- 0019: from warm lead to receipt, partner rosters, daily summaries. Safe to run twice.

-- ---------- organisations get a short code used in document numbers (e.g. KE461) ----------
alter table public.organisations add column if not exists code text;

-- ---------- quotes carry what the proposal and quotation need ----------
alter table public.quotes add column if not exists number text;
alter table public.quotes add column if not exists participants int;
alter table public.quotes add column if not exists sessions int not null default 5;
alter table public.quotes add column if not exists share_token text not null default replace(gen_random_uuid()::text, '-', '');
alter table public.quotes add column if not exists sent_at timestamptz;
alter table public.quotes add column if not exists sent_to text;
alter table public.quotes add column if not exists accepted_at timestamptz;
alter table public.quotes add column if not exists notes text;
create unique index if not exists quotes_number_uq on public.quotes (number) where number is not null;
create unique index if not exists quotes_token_uq on public.quotes (share_token);

-- ---------- invoices: training and follow-up, with a shareable page ----------
alter table public.invoices add column if not exists kind text not null default 'training' check (kind in ('training','followup','other'));
alter table public.invoices add column if not exists cohort_id uuid references public.cohorts(id);
alter table public.invoices add column if not exists description text;
alter table public.invoices add column if not exists share_token text not null default replace(gen_random_uuid()::text, '-', '');
alter table public.invoices add column if not exists sent_at timestamptz;
create unique index if not exists invoices_token_uq on public.invoices (share_token);
-- one follow-up invoice per cohort, so the daily job can never bill twice
create unique index if not exists invoices_followup_once on public.invoices (cohort_id) where kind = 'followup';

-- ---------- receipts, one per payment ----------
create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id) on delete cascade,
  number text not null unique,
  issued_on date not null default current_date,
  share_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  sent_at timestamptz
);

-- ---------- "we have paid" notices from partners, confirmed by a founder ----------
create table if not exists public.payment_notices (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id),
  amount_kes int not null check (amount_kes > 0),
  method text not null default 'mpesa' check (method in ('mpesa','bank','cash')),
  reference text,
  paid_on date not null default current_date,
  note text,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  created_by uuid references public.people(id),
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.people(id),
  reviewed_at timestamptz,
  review_note text,
  payment_id uuid references public.payments(id)
);
create index if not exists payment_notices_status on public.payment_notices (status, created_at);

-- ---------- participants a partner wants trained, loaded before the training day ----------
create table if not exists public.cohort_roster (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id),
  full_name text not null,
  phone text,
  gender text check (gender in ('F','M')),
  birth_year int,
  guardian_consent boolean not null default false,
  note text,
  status text not null default 'expected' check (status in ('expected','enrolled','withdrawn')),
  enrolment_id uuid references public.enrolments(id) on delete set null,
  added_by uuid references public.people(id),
  created_at timestamptz not null default now()
);
create unique index if not exists cohort_roster_phone_uq on public.cohort_roster (cohort_id, phone) where phone is not null;

-- ---------- what we tell the partner after each training day ----------
create table if not exists public.day_summaries (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  session_id uuid not null unique references public.sessions(id) on delete cascade,
  day_number int not null,
  held_on date,
  covered text,                 -- what was taught, in plain words
  note_for_partner text,        -- anything the partner should know or do
  present_count int not null default 0,
  absent_count int not null default 0,
  author_id uuid references public.people(id),
  published_at timestamptz not null default now()
);
-- names live apart from the counts so a partner without named access can never read them
create table if not exists public.day_summary_names (
  id uuid primary key default gen_random_uuid(),
  summary_id uuid not null references public.day_summaries(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  name text not null,
  present boolean not null
);

alter table public.receipts enable row level security;
alter table public.payment_notices enable row level security;
alter table public.cohort_roster enable row level security;
alter table public.day_summaries enable row level security;
alter table public.day_summary_names enable row level security;

drop policy if exists rcp_read on public.receipts;
create policy rcp_read on public.receipts for select using (
  app.is_staff() or payment_id in (select p.id from public.payments p where p.invoice_id in (select app.my_org_invoices())));
drop policy if exists rcp_write on public.receipts;
create policy rcp_write on public.receipts for all using (app.is_founder()) with check (app.is_founder());

drop policy if exists pn_read on public.payment_notices;
create policy pn_read on public.payment_notices for select using (app.is_staff() or organisation_id in (select app.my_org_admin_orgs()));
drop policy if exists pn_insert on public.payment_notices;
create policy pn_insert on public.payment_notices for insert with check (
  status = 'pending' and created_by = app.me() and organisation_id in (select app.my_org_admin_orgs())
  and invoice_id in (select app.my_org_invoices()));
drop policy if exists pn_write on public.payment_notices;
create policy pn_write on public.payment_notices for update using (app.is_founder()) with check (app.is_founder());

drop policy if exists ros_read on public.cohort_roster;
create policy ros_read on public.cohort_roster for select using (
  app.is_staff() or organisation_id in (select app.my_orgs()) or cohort_id in (select app.my_cohorts()));
drop policy if exists ros_insert on public.cohort_roster;
create policy ros_insert on public.cohort_roster for insert with check (
  app.is_staff() or (status = 'expected' and added_by = app.me() and organisation_id in (select app.my_org_admin_orgs())
    and organisation_id = app.org_of_cohort(cohort_id)));
drop policy if exists ros_update on public.cohort_roster;
create policy ros_update on public.cohort_roster for update using (
  app.is_staff() or cohort_id in (select app.my_cohorts()) or (status = 'expected' and organisation_id in (select app.my_org_admin_orgs())))
  with check (app.is_staff() or cohort_id in (select app.my_cohorts()) or (status in ('expected','withdrawn') and organisation_id in (select app.my_org_admin_orgs())));
drop policy if exists ros_delete on public.cohort_roster;
create policy ros_delete on public.cohort_roster for delete using (
  app.is_staff() or (status = 'expected' and organisation_id in (select app.my_org_admin_orgs())));

drop policy if exists ds_read on public.day_summaries;
create policy ds_read on public.day_summaries for select using (
  app.is_staff() or cohort_id in (select app.my_cohorts()) or app.is_master_trainer()
  or cohort_id in (select app.cohorts_of_my_orgs()));
drop policy if exists ds_write on public.day_summaries;
create policy ds_write on public.day_summaries for all using (app.is_staff() or cohort_id in (select app.my_cohorts()))
  with check (app.is_staff() or cohort_id in (select app.my_cohorts()));
drop policy if exists dsn_read on public.day_summary_names;
create policy dsn_read on public.day_summary_names for select using (
  app.is_staff() or cohort_id in (select app.my_cohorts()) or app.is_master_trainer() or app.cohort_sees_named(cohort_id));
drop policy if exists dsn_write on public.day_summary_names;
create policy dsn_write on public.day_summary_names for all using (app.is_staff() or cohort_id in (select app.my_cohorts()))
  with check (app.is_staff() or cohort_id in (select app.my_cohorts()));

-- partners may see the monthly meet-ups (not who signed in)
drop policy if exists sem_org_read on public.seminars;
create policy sem_org_read on public.seminars for select using (app.has_role('org_admin') or app.has_role('org_viewer'));

grant select, insert, update, delete on public.receipts, public.payment_notices, public.cohort_roster, public.day_summaries, public.day_summary_names to authenticated;
