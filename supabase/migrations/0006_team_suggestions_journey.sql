-- 0006: richer people and organisation details, suggestions from trainers,
-- first-login PIN change, and rules that stop founders certifying or promoting themselves.

-- ---------- people: details that matter for programme fit ----------
alter table public.people
  add column if not exists education_level text
    check (education_level in ('none','primary_incomplete','primary','secondary_incomplete','secondary','tvet_certificate','diploma','degree','postgraduate')),
  add column if not exists occupation text,
  add column if not exists county text,
  add column if not exists ward text,
  add column if not exists pin_reset_required boolean not null default false;

-- ---------- organisations: where they are and who to talk to ----------
alter table public.organisations
  add column if not exists address text,
  add column if not exists contact_person text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists approx_people int,
  add column if not exists what_they_do text,
  add column if not exists is_internal boolean not null default false;  -- the founders' own training cohort, kept out of partner numbers

-- ---------- invitations (individual suggestions) carry the same details ----------
alter table public.invitations
  add column if not exists education_level text
    check (education_level in ('none','primary_incomplete','primary','secondary_incomplete','secondary','tvet_certificate','diploma','degree','postgraduate')),
  add column if not exists occupation text,
  add column if not exists county text,
  add column if not exists ward text;

-- ---------- organisation suggestions ----------
create table if not exists public.org_suggestions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('church','cdc','school','college','ngo','company','other')),
  parent_id uuid references public.organisations(id),
  county text not null,
  ward text,
  address text,
  contact_person text,
  contact_phone text,
  contact_email text,
  approx_people int,
  what_they_do text,
  why text,
  suggested_by uuid not null references public.people(id),
  status text not null default 'suggested' check (status in ('suggested','approved','declined')),
  decided_by uuid references public.people(id),
  decision_note text,
  organisation_id uuid references public.organisations(id),
  created_at timestamptz not null default now()
);
alter table public.org_suggestions enable row level security;

create policy os_read on public.org_suggestions for select using (suggested_by = app.me() or app.is_staff());
create policy os_insert on public.org_suggestions for insert with check (
  suggested_by = app.me() and status = 'suggested' and (app.is_staff() or app.facilitator_tier() >= 1));
create policy os_staff on public.org_suggestions for update using (app.is_staff()) with check (app.is_staff());

grant select, insert, update, delete on public.org_suggestions to authenticated;

-- ---------- founders go through the journey, but cannot certify or promote themselves ----------
drop policy if exists cert_write on public.certifications;
create policy cert_write on public.certifications for all using (app.is_founder())
  with check (app.is_founder() and person_id <> app.me());

drop policy if exists ra_founder on public.role_assignments;
create policy ra_founder on public.role_assignments for all using (app.is_founder())
  with check (app.is_founder() and not (person_id = app.me() and role = 'facilitator' and tier > 1));

-- staff (founders) can create the canvas when they enrol someone in a cohort
drop policy if exists cv_write on public.canvases;
create policy cv_write on public.canvases for all using (
  app.is_staff() or enrolment_id in (select app.my_enrolments()) or enrolment_id in (select app.my_cohort_enrolments()))
  with check (app.is_staff() or enrolment_id in (select app.my_enrolments()) or enrolment_id in (select app.my_cohort_enrolments()));
