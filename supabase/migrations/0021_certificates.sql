-- 0021: printable certificates for participants and for each trainer level, with reminders. Safe to run twice.

alter table public.certifications add column if not exists share_token text not null default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists certifications_token_uq on public.certifications (share_token);

create table if not exists public.participant_certificates (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid not null unique references public.enrolments(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  number text not null unique,
  issued_on date not null default current_date,
  share_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  issued_by uuid references public.people(id)
);
create index if not exists participant_certificates_cohort on public.participant_certificates (cohort_id);

-- partners see that certificates were issued, never a list of names unless their agreement allows it
alter table public.cohorts add column if not exists certificates_issued_on date;
alter table public.cohorts add column if not exists certificates_count int not null default 0;

alter table public.participant_certificates enable row level security;
drop policy if exists pc_read on public.participant_certificates;
create policy pc_read on public.participant_certificates for select using (
  person_id = app.me() or app.is_staff() or cohort_id in (select app.my_cohorts()) or app.is_master_trainer()
  or app.cohort_sees_named(cohort_id));
drop policy if exists pc_write on public.participant_certificates;
create policy pc_write on public.participant_certificates for all using (app.is_founder()) with check (app.is_founder());
grant select, insert, update, delete on public.participant_certificates to authenticated;
