-- 0020: cohorts keep the order they came in; partners can request their own quotation (once); follow-up visits are invoiced one by one. Safe to run twice.

-- ---------- cohort order ----------
create sequence if not exists public.cohort_seq start 10;
alter table public.cohorts add column if not exists seq int;
update public.cohorts set seq = case name
  when 'Youth Cohort 1' then 1 when 'Adult Cohort 1' then 2 when 'Adult Cohort 2' then 3 when 'Adult Cohort 3' then 4
  when 'Founders'' cohort' then 9 else seq end where seq is null;
update public.cohorts set seq = nextval('public.cohort_seq') where seq is null;
alter table public.cohorts alter column seq set default nextval('public.cohort_seq');

-- ---------- partner-generated quotations, released after a short delay ----------
alter table public.quotes add column if not exists self_service boolean not null default false;
alter table public.quotes add column if not exists release_at timestamptz;
alter table public.quotes add column if not exists requested_by uuid references public.people(id);

-- ---------- one invoice per follow-up visit ----------
alter table public.invoices add column if not exists visit int check (visit in (30,60,90));
drop index if exists public.invoices_followup_once;
create unique index if not exists invoices_followup_visit on public.invoices (cohort_id, visit) where kind = 'followup';
