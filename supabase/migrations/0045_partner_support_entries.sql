-- 0045: support given to participants is mostly given by the partner organisation, so the partner can record what they gave each participant.
-- Founders and staff can still enter or correct any row. A partner sees and changes only the rows it recorded itself, for its own cohorts.
alter table public.support_ledger add column if not exists source text not null default 'founders' check (source in ('founders','partner'));
alter table public.support_ledger add column if not exists given_by_org uuid references public.organisations(id);
alter table public.support_ledger add column if not exists recorded_by uuid references public.people(id);
alter table public.support_ledger add column if not exists created_at timestamptz not null default now();
alter table public.support_ledger add column if not exists note text;
create index if not exists support_ledger_enrolment on public.support_ledger(enrolment_id);
create index if not exists support_ledger_org on public.support_ledger(given_by_org) where given_by_org is not null;

create or replace function app.org_of_enrolment(e uuid) returns uuid language sql stable security definer set search_path = public as $$
  select c.organisation_id from public.enrolments en join public.cohorts c on c.id = en.cohort_id where en.id = e
$$;

drop policy if exists sl_partner_read on public.support_ledger;
create policy sl_partner_read on public.support_ledger for select using (
  source = 'partner' and given_by_org in (select app.my_org_admin_orgs()));
drop policy if exists sl_partner_insert on public.support_ledger;
create policy sl_partner_insert on public.support_ledger for insert with check (
  source = 'partner' and recorded_by = app.me() and given_by_org in (select app.my_org_admin_orgs())
  and given_by_org = app.org_of_enrolment(enrolment_id) and amount_kes > 0);
drop policy if exists sl_partner_update on public.support_ledger;
create policy sl_partner_update on public.support_ledger for update
  using (source = 'partner' and given_by_org in (select app.my_org_admin_orgs()))
  with check (source = 'partner' and given_by_org in (select app.my_org_admin_orgs()) and given_by_org = app.org_of_enrolment(enrolment_id) and amount_kes > 0);
drop policy if exists sl_partner_delete on public.support_ledger;
create policy sl_partner_delete on public.support_ledger for delete using (
  source = 'partner' and given_by_org in (select app.my_org_admin_orgs()));

grant select, insert, update, delete on public.support_ledger to authenticated;
grant execute on function app.org_of_enrolment(uuid) to authenticated;
